import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test
} from "@playwright/test";
import { stagingMailApiPath } from "./mail-api-path";
import { ensureStagingSetup } from "./setup";

const email = required("HQBASE_STAGING_OWNER_EMAIL");
const password = required("HQBASE_STAGING_OWNER_PASSWORD");
const sender = required("HQBASE_STAGING_SENDER");
const domain = required("HQBASE_STAGING_EMAIL_DOMAIN");
const stagingUrl = required("HQBASE_STAGING_URL");

test("HQBase web lifecycle remains healthy", async ({ page, request }) => {
  const appOrigin = new URL(stagingUrl).origin;
  const appShellErrors: string[] = [];
  const recordAppShellError = (message: string): void => {
    if (appShellErrors.length < 20) appShellErrors.push(message);
  };
  page.on("pageerror", (error) => recordAppShellError(`pageerror: ${error.message}`));
  page.on("requestfailed", (failedRequest) => {
    const url = new URL(failedRequest.url());
    if (url.origin === appOrigin) {
      recordAppShellError(
        `requestfailed: ${url.pathname} (${failedRequest.failure()?.errorText ?? "unknown"})`
      );
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === appOrigin && response.status() >= 400) {
      recordAppShellError(`response: ${response.status()} ${url.pathname}`);
    }
  });

  await expect
    .poll(
      async () => {
        try {
          return (await request.get("/api/health")).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000 }
    )
    .toBe(200);

  await ensureStagingSetup(request);

  await expect
    .poll(async () => {
      const response = await request.get("/api/setup/status");
      if (!response.ok()) return false;
      return ((await response.json()) as { isComplete: boolean }).isComplete;
    })
    .toBe(true);

  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(
    login.ok(),
    `Owner API sign-in failed (${login.status()}): ${await login.text()}`
  ).toBeTruthy();
  if ((process.env.HQBASE_STAGING_MAIL_API_BASE_PATH ?? "/api/v2") === "/api/v2") {
    const checkpoint = await request.get(stagingMailApiPath("/changes"));
    expect(checkpoint.ok(), await checkpoint.text()).toBeTruthy();
    await expect(checkpoint.json()).resolves.toMatchObject({
      changes: [],
      nextCursor: expect.any(String),
      hasMore: false
    });
    const draftCheckpoint = await request.get(stagingMailApiPath("/drafts/changes"));
    expect(draftCheckpoint.ok(), await draftCheckpoint.text()).toBeTruthy();
    await expect(draftCheckpoint.json()).resolves.toMatchObject({
      changes: [],
      nextCursor: expect.any(String),
      hasMore: false
    });
  }
  const primaryEmailAction = page.getByRole("button", {
    name: /^(?:Compose|New email)$/
  });
  const loginEmail = page.getByLabel("Email");
  const eventSocket = page.waitForEvent("websocket", {
    predicate: (socket) => new URL(socket.url()).pathname === "/api/v2/events",
    timeout: 60_000
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      loginEmail.or(primaryEmailAction),
      "HQBase app shell renders its authenticated state"
    ).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    const shell = await page.evaluate(() => ({
      path: window.location.pathname,
      rootChildren: document.querySelector("#root")?.childElementCount ?? -1,
      scripts: [...document.scripts].map((script) =>
        script.src ? new URL(script.src).pathname : "(inline)"
      ),
      title: document.title
    }));
    console.error("HQBase app shell diagnostics", { appShellErrors, shell });
    throw error;
  }
  if (await loginEmail.isVisible()) {
    await loginEmail.fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(primaryEmailAction).toBeVisible({ timeout: 60_000 });
  await expect(eventSocket).resolves.toBeDefined();
  const expectedUpdate = process.env.HQBASE_STAGING_EXPECT_UPDATE_VERSION;
  if (expectedUpdate) {
    await expect
      .poll(
        async () => {
          const response = await request.get("/api/updates");
          if (!response.ok()) return null;
          const update = (await response.json()) as {
            available?: boolean;
            release?: { version?: string };
          };
          return {
            available: update.available,
            version: update.release?.version
          };
        },
        { timeout: 60_000 }
      )
      .toEqual({ available: true, version: expectedUpdate });
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByText("Update available", { exact: true })).toBeVisible({
        timeout: 15_000
      });
    }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    await expect(page.getByText(`HQBase ${expectedUpdate}`, { exact: false })).toBeVisible({
      timeout: 60_000
    });
    const updateResponse = await request.get("/api/updates");
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();
    const update = (await updateResponse.json()) as { release?: { notes?: string[] } };
    const firstNote = update.release?.notes?.[0];
    if (firstNote) {
      await expect(page.getByText(firstNote, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "View changelog" }).click();
      await expect(page.getByRole("heading", { name: "What’s changing" })).toBeVisible();
      for (const note of update.release?.notes ?? []) {
        await expect(page.getByText(note, { exact: true }).last()).toBeVisible();
      }
    }
  }
});

test("Track 1 enforces read-only mailbox access and exposes operator diagnostics", async ({
  request
}) => {
  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(
    login.ok(),
    `Owner API sign-in failed (${login.status()}): ${await login.text()}`
  ).toBeTruthy();
  const mailboxesResponse = await request.get(stagingMailApiPath("/mailboxes"));
  expect(mailboxesResponse.ok()).toBeTruthy();
  const mailboxes = (await mailboxesResponse.json()) as Array<{ id: string; address: string }>;
  const mailbox = mailboxes.find((item) => item.address === sender);
  expect(mailbox).toBeDefined();

  const suffix = `${Date.now()}-${process.env.GITHUB_RUN_ID ?? "local"}`;
  const loginDomain = email.split("@")[1];
  if (!loginDomain) throw new Error("HQBASE_STAGING_OWNER_EMAIL must contain a domain.");
  const memberEmail = `kirill-${suffix}@${loginDomain}`;
  const memberPassword = `${password}Track1!`;
  const member = await createStagingMember(request, {
    email: memberEmail,
    password: memberPassword
  });
  const grant = await request.put("/api/mailbox-grants", {
    data: { mailboxId: mailbox?.id, userId: member.id, accessLevel: "read" }
  });
  expect(grant.status()).toBe(204);

  const memberRequest = await playwrightRequest.newContext({
    baseURL: stagingUrl,
    extraHTTPHeaders: accessHeaders()
  });
  try {
    const memberLogin = await memberRequest.post("/api/auth/sign-in/email", {
      data: { email: memberEmail, password: member.loginPassword, rememberMe: false },
      headers: { origin: stagingUrl }
    });
    expect(memberLogin.ok()).toBeTruthy();
    if (member.passwordSetupRequired) {
      const passwordSetup = await memberRequest.post("/api/me/password", {
        data: {
          confirmPassword: memberPassword,
          currentPassword: member.loginPassword,
          newPassword: memberPassword
        },
        headers: { origin: stagingUrl }
      });
      expect(passwordSetup.ok(), await passwordSetup.text()).toBeTruthy();
    }
    const visible = await memberRequest.get(stagingMailApiPath("/mailboxes"));
    expect((await visible.json()) as Array<{ id: string }>).toEqual([
      expect.objectContaining({ id: mailbox?.id })
    ]);
    const revoke = await request.delete(`/api/mailbox-grants/${mailbox?.id}/${member.id}`);
    expect(revoke.status()).toBe(204);
    const hidden = await memberRequest.get(stagingMailApiPath("/mailboxes"));
    expect(hidden.ok()).toBeTruthy();
    expect(await hidden.json()).toEqual([]);
  } finally {
    await memberRequest.dispose();
  }

  const diagnostics = await request.get("/api/operations/diagnostics");
  expect(diagnostics.ok()).toBeTruthy();
  await expect(diagnostics.json()).resolves.toMatchObject({ ready: true });
  const scan = await request.post("/api/operations/integrity-scan");
  expect(scan.status()).toBe(202);
});

test("a mailbox agent stays inside its assigned mailbox and revokes cleanly", async ({
  request
}) => {
  test.skip(
    (process.env.HQBASE_STAGING_MAIL_API_BASE_PATH ?? "/api/v2") === "/api",
    "The N-1 bootstrap predates mailbox agents."
  );

  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const mailboxesResponse = await request.get(stagingMailApiPath("/mailboxes"));
  expect(mailboxesResponse.ok(), await mailboxesResponse.text()).toBeTruthy();
  const mailboxes = (await mailboxesResponse.json()) as Array<{ id: string; address: string }>;
  const mailbox = mailboxes.find((item) => item.address === sender);
  if (!mailbox) throw new Error(`Staging mailbox ${sender} was not found.`);

  const agentsResponse = await request.get("/management/v1/agents");
  const agentsBody = await agentsResponse.text();
  expect(agentsResponse.status(), agentsBody).toBe(200);
  expect(agentsResponse.headers()["content-type"]).toContain("application/json");
  expect(JSON.parse(agentsBody)).toMatchObject({ agents: expect.any(Array) });

  const createdResponse = await request.post("/management/v1/agents", {
    data: {
      profile: "mailbox",
      name: `Staging reader ${Date.now()}`,
      accessLevel: "read",
      mailbox: { id: mailbox.id }
    }
  });
  expect(createdResponse.status(), await createdResponse.text()).toBe(201);
  const created = (await createdResponse.json()) as {
    agent: { id: string };
    credential: string;
  };
  expect(created.credential).toMatch(/^hqb_agent_/u);

  const agentRequest = await playwrightRequest.newContext({
    baseURL: stagingUrl,
    extraHTTPHeaders: {
      ...accessHeaders(),
      authorization: `Bearer ${created.credential}`
    }
  });
  try {
    const visible = await agentRequest.get(stagingMailApiPath("/mailboxes"));
    expect(visible.ok(), await visible.text()).toBeTruthy();
    expect(await visible.json()).toEqual([expect.objectContaining({ id: mailbox.id })]);

    const wrongResource = await agentRequest.post("/management/v1/agents", {
      data: {
        profile: "mailbox",
        name: "Forbidden child",
        accessLevel: "read",
        mailbox: { address: `forbidden@${domain}`, displayName: "Forbidden" }
      }
    });
    expect(wrongResource.status()).toBe(401);
  } finally {
    const disabled = await request.patch(`/management/v1/agents/${created.agent.id}`, {
      data: { isActive: false }
    });
    expect(disabled.ok(), await disabled.text()).toBeTruthy();
    const revoked = await agentRequest.get(stagingMailApiPath("/mailboxes"));
    expect(revoked.status()).toBe(401);
    await agentRequest.dispose();
  }
});

test("candidate mail experience contracts work together", async ({ request }) => {
  test.setTimeout(180_000);
  test.skip(
    (process.env.HQBASE_STAGING_MAIL_API_BASE_PATH ?? "/api/v2") === "/api",
    "The N-1 bootstrap does not include candidate-only mail experience APIs."
  );

  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const mailboxesResponse = await request.get(stagingMailApiPath("/mailboxes"));
  expect(mailboxesResponse.ok(), await mailboxesResponse.text()).toBeTruthy();
  const mailboxes = (await mailboxesResponse.json()) as Array<{
    address: string;
    displayName: string;
    id: string;
    mailDomainId: string;
  }>;
  const primaryMailbox = mailboxes.find((item) => item.address === sender);
  if (!primaryMailbox) throw new Error(`Staging mailbox ${sender} was not found.`);
  const domainsResponse = await request.get("/api/domains");
  expect(domainsResponse.ok(), await domainsResponse.text()).toBeTruthy();
  const upgradesLegacyCatchAll =
    Boolean(process.env.PREVIOUS_TAG) &&
    process.env.HQBASE_STAGING_PREVIOUS_HAS_CATCH_ALL_POLICY === "0";
  const expectedPrimaryCatchAll = upgradesLegacyCatchAll
    ? { catchAllMailboxId: null, catchAllPolicy: "unassigned" }
    : { catchAllMailboxId: primaryMailbox.id, catchAllPolicy: "mailbox" };
  expect(await domainsResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ...expectedPrimaryCatchAll,
        id: primaryMailbox.mailDomainId
      })
    ])
  );

  const suffix = `${process.env.GITHUB_RUN_ID ?? "local"}-${Date.now()}`;
  const searchTerm = `experience${suffix.replaceAll(/[^a-zA-Z0-9]/g, "")}`;
  const contactEmail = `contact-${suffix}@${domain}`;
  const secondDomainName = `second-${suffix}.${domain}`;
  const secondDomainResponse = await request.post("/api/domains", {
    data: {
      dnsStatus: "ready",
      name: secondDomainName,
      receivingStatus: "ready",
      sendingStatus: "ready"
    }
  });
  expect(secondDomainResponse.status(), await secondDomainResponse.text()).toBe(201);
  const secondDomain = (await secondDomainResponse.json()) as {
    catchAllPolicy: string;
    id: string;
  };
  expect(secondDomain.catchAllPolicy).toBe("unassigned");
  const disconnectWithoutZone = await request.post(`/api/domains/${secondDomain.id}/disconnect`);
  expect(disconnectWithoutZone.status()).toBe(409);
  await expect(disconnectWithoutZone.json()).resolves.toMatchObject({
    error: { code: "DOMAIN_ZONE_REQUIRED" }
  });
  const forgetConnected = await request.delete(`/api/domains/${secondDomain.id}`, {
    data: { confirmation: secondDomainName }
  });
  expect(forgetConnected.status()).toBe(409);
  await expect(forgetConnected.json()).resolves.toMatchObject({
    error: { code: "DOMAIN_DISCONNECT_REQUIRED" }
  });
  const secondAddress = `second@${secondDomainName}`;
  const secondMailboxResponse = await request.post("/api/mailboxes", {
    data: { address: secondAddress, displayName: `Second ${suffix}` }
  });
  expect(secondMailboxResponse.status(), await secondMailboxResponse.text()).toBe(201);
  const secondMailbox = (await secondMailboxResponse.json()) as { id: string };

  const loginDomain = email.split("@")[1];
  if (!loginDomain) throw new Error("HQBASE_STAGING_OWNER_EMAIL must contain a domain.");
  const memberEmail = `experience-member-${suffix}@${loginDomain}`;
  const memberPassword = `Staging-${suffix}-member!`;
  const member = await createStagingUser(request, {
    email: memberEmail,
    name: `Experience member ${suffix}`,
    password: memberPassword,
    role: "member"
  });
  const adminEmail = `experience-admin-${suffix}@${loginDomain}`;
  const adminPassword = `Staging-${suffix}-admin!`;
  const admin = await createStagingUser(request, {
    email: adminEmail,
    name: `Experience admin ${suffix}`,
    password: adminPassword,
    role: "admin"
  });
  for (const mailboxId of [primaryMailbox.id, secondMailbox.id]) {
    const grant = await request.put("/api/mailbox-grants", {
      data: { accessLevel: "agent", mailboxId, userId: member.id }
    });
    expect(grant.status(), await grant.text()).toBe(204);
  }

  const memberRequest = await authenticatedStagingRequest({
    chosenPassword: memberPassword,
    email: memberEmail,
    user: member
  });
  const adminRequest = await authenticatedStagingRequest({
    chosenPassword: adminPassword,
    email: adminEmail,
    user: admin
  });
  try {
    const strictMailboxContacts = await memberRequest.get(
      `/api/contacts?search=${encodeURIComponent(secondAddress)}`
    );
    expect(strictMailboxContacts.ok(), await strictMailboxContacts.text()).toBeTruthy();
    expect(await strictMailboxContacts.json()).toEqual([]);

    const mailboxSuggestions = await memberRequest.get(
      `/api/contacts/suggestions?search=${encodeURIComponent(secondAddress)}`
    );
    expect(mailboxSuggestions.ok(), await mailboxSuggestions.text()).toBeTruthy();
    expect(await mailboxSuggestions.json()).toEqual([
      expect.objectContaining({
        email: secondAddress,
        name: `Second ${suffix}`,
        source: "mailbox"
      })
    ]);

    const personalSignature = await createStagingSignature(memberRequest, {
      html: `<p>Personal ${searchTerm}</p>`,
      isDefault: true,
      name: `Personal ${suffix}`,
      scope: { id: member.id, type: "user" }
    });
    const primaryDomainSignature = await createStagingSignature(request, {
      html: `<p>Primary domain ${searchTerm}</p>`,
      isDefault: true,
      name: `Primary domain ${suffix}`,
      scope: { id: primaryMailbox.mailDomainId, type: "domain" }
    });
    const secondDomainSignature = await createStagingSignature(request, {
      html: `<p>Second domain ${searchTerm}</p>`,
      isDefault: true,
      name: `Second domain ${suffix}`,
      scope: { id: secondDomain.id, type: "domain" }
    });
    const signatureText = `Signature ${searchTerm}`;
    const primaryMailboxSignature = await createStagingSignature(request, {
      html: `<p>${signatureText}</p>`,
      isDefault: true,
      name: `Mailbox ${suffix}`,
      scope: { id: primaryMailbox.id, type: "mailbox" }
    });
    const secondMailboxSignature = await createStagingSignature(request, {
      html: `<p>Second mailbox ${searchTerm}</p>`,
      isDefault: false,
      name: `Second mailbox ${suffix}`,
      scope: { id: secondMailbox.id, type: "mailbox" }
    });
    const adminDomainSignature = await createStagingSignature(adminRequest, {
      html: `<p>Admin domain ${searchTerm}</p>`,
      isDefault: false,
      name: `Admin domain ${suffix}`,
      scope: { id: primaryMailbox.mailDomainId, type: "domain" }
    });

    expect(await stagingSignatureSelection(memberRequest, sender)).toMatchObject({
      automaticSignatureId: primaryMailboxSignature.id,
      signatures: expect.arrayContaining([
        expect.objectContaining({ id: personalSignature.id, scope: "user" }),
        expect.objectContaining({ id: primaryDomainSignature.id, scope: "domain" }),
        expect.objectContaining({ id: primaryMailboxSignature.id, scope: "mailbox" })
      ])
    });
    const noMailboxDefault = await request.patch(`/api/signatures/${primaryMailboxSignature.id}`, {
      data: { isDefault: false }
    });
    expect(noMailboxDefault.ok(), await noMailboxDefault.text()).toBeTruthy();
    expect((await stagingSignatureSelection(memberRequest, sender)).automaticSignatureId).toBe(
      personalSignature.id
    );
    const noPersonalDefault = await memberRequest.patch(`/api/signatures/${personalSignature.id}`, {
      data: { isDefault: false }
    });
    expect(noPersonalDefault.ok(), await noPersonalDefault.text()).toBeTruthy();
    expect((await stagingSignatureSelection(memberRequest, sender)).automaticSignatureId).toBe(
      primaryDomainSignature.id
    );
    const noPrimaryDefault = await request.patch(`/api/signatures/${primaryDomainSignature.id}`, {
      data: { isDefault: false }
    });
    expect(noPrimaryDefault.ok(), await noPrimaryDefault.text()).toBeTruthy();
    expect(
      (await stagingSignatureSelection(memberRequest, sender)).automaticSignatureId
    ).toBeNull();

    // Each exact From address is a mailbox in the current one-address-per-mailbox model.
    const secondSelection = await stagingSignatureSelection(memberRequest, secondAddress);
    expect(secondSelection).toMatchObject({
      automaticSignatureId: secondDomainSignature.id,
      signatures: expect.arrayContaining([
        expect.objectContaining({ id: secondDomainSignature.id, scope: "domain" }),
        expect.objectContaining({ id: secondMailboxSignature.id, scope: "mailbox" })
      ])
    });
    expect(secondSelection.signatures.map(({ id }) => id)).not.toContain(primaryDomainSignature.id);
    const restoredMailboxDefault = await request.patch(
      `/api/signatures/${primaryMailboxSignature.id}`,
      { data: { isDefault: true } }
    );
    expect(restoredMailboxDefault.ok(), await restoredMailboxDefault.text()).toBeTruthy();

    const forbiddenSend = await adminRequest.post("/api/v2/send", {
      data: {
        from: sender,
        signature: { id: adminDomainSignature.id, mode: "selected" },
        subject: `Forbidden ${searchTerm}`,
        text: `Forbidden ${searchTerm}`,
        to: [contactEmail]
      }
    });
    expect(forbiddenSend.status(), await forbiddenSend.text()).toBe(403);
    await expect(forbiddenSend.json()).resolves.toMatchObject({
      error: { code: "MAILBOX_FORBIDDEN" }
    });

    const authoredText = `Authored ${searchTerm}`;
    const draftResponse = await memberRequest.post("/api/v2/drafts", {
      data: {
        bcc: [],
        cc: [],
        from: sender,
        html: `<p>${authoredText}</p>`,
        mailboxId: primaryMailbox.id,
        signature: { id: primaryMailboxSignature.id, mode: "selected" },
        subject: `Mail ${searchTerm}`,
        text: authoredText,
        to: [contactEmail]
      }
    });
    expect(draftResponse.status(), await draftResponse.text()).toBe(201);
    const manualDraft = (await draftResponse.json()) as StagingDraft;
    expect(manualDraft.signature).toMatchObject({
      id: primaryMailboxSignature.id,
      mode: "selected",
      text: signatureText
    });

    const changedSignatureText = `Changed signature ${searchTerm}`;
    const changedSignature = await request.patch(`/api/signatures/${primaryMailboxSignature.id}`, {
      data: { html: `<p>${changedSignatureText}</p>` }
    });
    expect(changedSignature.ok(), await changedSignature.text()).toBeTruthy();
    const reopenedDraftResponse = await memberRequest.get(`/api/v2/drafts/${manualDraft.id}`);
    expect(reopenedDraftResponse.ok(), await reopenedDraftResponse.text()).toBeTruthy();
    const reopenedDraft = (await reopenedDraftResponse.json()) as StagingDraft;
    expect(reopenedDraft).toMatchObject({
      from: sender,
      subject: `Mail ${searchTerm}`,
      text: authoredText,
      to: [contactEmail],
      signature: {
        id: primaryMailboxSignature.id,
        mode: "selected",
        text: signatureText
      }
    });

    const contactBeforeSend = await memberRequest.get(
      `/api/contacts?search=${encodeURIComponent(contactEmail)}`
    );
    expect(contactBeforeSend.ok(), await contactBeforeSend.text()).toBeTruthy();
    expect(await contactBeforeSend.json()).toEqual([]);

    const sendResponse = await memberRequest.post("/api/v2/send", {
      data: {
        bcc: reopenedDraft.bcc,
        cc: reopenedDraft.cc,
        draftId: reopenedDraft.id,
        from: reopenedDraft.from,
        html: reopenedDraft.html,
        subject: reopenedDraft.subject,
        text: reopenedDraft.text,
        to: reopenedDraft.to
      }
    });
    expect(sendResponse.status(), await sendResponse.text()).toBe(201);
    const sent = (await sendResponse.json()) as {
      fromAddress: string;
      fromName: string | null;
      id: string;
      threadId: string;
    };
    expect(sent).toMatchObject({
      fromAddress: sender,
      fromName: primaryMailbox.displayName
    });
    const sentBodies = await storedMessageBodies(memberRequest, sent.id);
    expect(sentBodies.text).toBe(`${authoredText}\n\n${signatureText}`);
    expectTextOrder(sentBodies.html, [authoredText, signatureText]);
    for (const controlText of ["Automatic", `Mailbox ${suffix}`]) {
      expect(sentBodies.text).not.toContain(controlText);
      expect(sentBodies.html).not.toContain(controlText);
    }
    const recentContact = await memberRequest.get(
      `/api/contacts?search=${encodeURIComponent(contactEmail)}`
    );
    expect(recentContact.ok(), await recentContact.text()).toBeTruthy();
    expect(await recentContact.json()).toEqual([
      expect.objectContaining({ email: contactEmail, saved: false, source: "recent" })
    ]);
    expect((await memberRequest.get(`/api/v2/drafts/${manualDraft.id}`)).status()).toBe(404);

    const fromDraftResponse = await memberRequest.post("/api/v2/drafts", {
      data: {
        bcc: [],
        cc: [],
        from: sender,
        mailboxId: primaryMailbox.id,
        signature: { id: primaryMailboxSignature.id, mode: "selected" },
        subject: `From change ${searchTerm}`,
        text: `From change ${searchTerm}`,
        to: [contactEmail]
      }
    });
    expect(fromDraftResponse.status(), await fromDraftResponse.text()).toBe(201);
    const fromDraft = (await fromDraftResponse.json()) as StagingDraft;
    const changedFromResponse = await memberRequest.patch(`/api/v2/drafts/${fromDraft.id}`, {
      data: {
        bcc: fromDraft.bcc,
        cc: fromDraft.cc,
        forwardOfMessageId: fromDraft.forwardOfMessageId,
        from: secondAddress,
        html: fromDraft.html,
        mailboxId: secondMailbox.id,
        replyToMessageId: fromDraft.replyToMessageId,
        subject: fromDraft.subject,
        text: fromDraft.text,
        to: fromDraft.to,
        version: fromDraft.version
      }
    });
    expect(changedFromResponse.ok(), await changedFromResponse.text()).toBeTruthy();
    await expect(changedFromResponse.json()).resolves.toMatchObject({
      from: secondAddress,
      mailboxId: secondMailbox.id,
      signature: {
        id: secondDomainSignature.id,
        mode: "automatic",
        text: `Second domain ${searchTerm}`
      }
    });

    const replyText = `Reply ${searchTerm}`;
    const replyResponse = await memberRequest.post("/api/v2/reply", {
      data: {
        from: sender,
        html: `<p>${replyText}</p>`,
        messageId: sent.id,
        signature: { mode: "automatic" },
        text: replyText,
        to: [contactEmail]
      }
    });
    expect(replyResponse.status(), await replyResponse.text()).toBe(201);
    const reply = (await replyResponse.json()) as { id: string };
    const replyBodies = await storedMessageBodies(memberRequest, reply.id);
    expectTextOrder(replyBodies.text, [replyText, changedSignatureText, authoredText]);
    expectTextOrder(replyBodies.html, [replyText, changedSignatureText, authoredText]);

    const forwardText = `Forward ${searchTerm}`;
    const forwardResponse = await memberRequest.post("/api/v2/forward", {
      data: {
        from: sender,
        html: `<p>${forwardText}</p>`,
        includeOriginalAttachments: false,
        messageId: sent.id,
        signature: { mode: "automatic" },
        text: forwardText,
        to: [contactEmail]
      }
    });
    expect(forwardResponse.status(), await forwardResponse.text()).toBe(201);
    const forwarded = (await forwardResponse.json()) as { id: string };
    const forwardBodies = await storedMessageBodies(memberRequest, forwarded.id);
    expectTextOrder(forwardBodies.text, [forwardText, changedSignatureText, authoredText]);
    expectTextOrder(forwardBodies.html, [forwardText, changedSignatureText, authoredText]);

    const contactPath = `/api/contacts/${encodeURIComponent(contactEmail)}`;
    const ownerContact = await request.put(contactPath, {
      data: {
        email: contactEmail,
        name: `Contact ${searchTerm}`,
        notes: `Owner note ${searchTerm}`
      }
    });
    expect(ownerContact.ok(), await ownerContact.text()).toBeTruthy();
    await expect(ownerContact.json()).resolves.toMatchObject({
      contact: { notes: `Owner note ${searchTerm}`, saved: true },
      conversations: expect.arrayContaining([expect.objectContaining({ threadId: sent.threadId })])
    });

    const memberContact = await memberRequest.put(contactPath, {
      data: {
        email: contactEmail,
        name: `Private ${searchTerm}`,
        notes: `Member note ${searchTerm}`
      }
    });
    expect(memberContact.ok(), await memberContact.text()).toBeTruthy();
    await expect(memberContact.json()).resolves.toMatchObject({
      contact: { notes: `Member note ${searchTerm}` },
      conversations: expect.arrayContaining([expect.objectContaining({ threadId: sent.threadId })])
    });

    const suggestions = await memberRequest.get(
      `/api/contacts?search=${encodeURIComponent(searchTerm)}`
    );
    expect(suggestions.ok(), await suggestions.text()).toBeTruthy();
    expect(await suggestions.json()).toEqual([
      expect.objectContaining({ email: contactEmail, name: `Private ${searchTerm}` })
    ]);

    const privateOwnerContact = await request.get(contactPath);
    expect(privateOwnerContact.ok(), await privateOwnerContact.text()).toBeTruthy();
    await expect(privateOwnerContact.json()).resolves.toMatchObject({
      contact: { notes: `Owner note ${searchTerm}` }
    });

    const searchableDraftResponse = await request.post("/api/v2/drafts", {
      data: {
        bcc: [],
        cc: [],
        from: sender,
        mailboxId: primaryMailbox.id,
        signature: { mode: "none" },
        subject: `Draft ${searchTerm}`,
        text: `Draft body ${searchTerm}`,
        to: [contactEmail]
      }
    });
    expect(searchableDraftResponse.status(), await searchableDraftResponse.text()).toBe(201);
    const searchableDraft = (await searchableDraftResponse.json()) as { id: string };

    const searchResponse = await request.get(
      `/api/search?q=${encodeURIComponent(searchTerm)}&limit=10`
    );
    expect(searchResponse.ok(), await searchResponse.text()).toBeTruthy();
    await expect(searchResponse.json()).resolves.toMatchObject({
      contacts: expect.arrayContaining([expect.objectContaining({ email: contactEmail })]),
      conversations: expect.arrayContaining([expect.objectContaining({ threadId: sent.threadId })]),
      drafts: expect.arrayContaining([expect.objectContaining({ id: searchableDraft.id })])
    });

    const labelResponse = await request.post("/api/labels", {
      data: { color: "blue", name: `Label ${suffix}` }
    });
    expect(labelResponse.status(), await labelResponse.text()).toBe(201);
    const label = (await labelResponse.json()) as { id: string };
    const assigned = await request.put(`/api/v2/messages/${sent.id}/labels/${label.id}`);
    expect(assigned.ok(), await assigned.text()).toBeTruthy();
    await expect(assigned.json()).resolves.toMatchObject({
      affected: 1,
      assigned: true,
      labelId: label.id,
      messageId: sent.id
    });

    const filtered = await request.get(`/api/v2/messages?labelId=${label.id}`);
    expect(filtered.ok(), await filtered.text()).toBeTruthy();
    expect(await filtered.json()).toEqual([
      expect.objectContaining({
        id: sent.id,
        labels: [expect.objectContaining({ id: label.id })]
      })
    ]);

    const removed = await request.delete(`/api/v2/messages/${sent.id}/labels/${label.id}`);
    expect(removed.ok(), await removed.text()).toBeTruthy();
    await expect(removed.json()).resolves.toMatchObject({ affected: 1, assigned: false });
  } finally {
    await Promise.all([memberRequest.dispose(), adminRequest.dispose()]);
  }
});

async function createStagingSignature(
  request: APIRequestContext,
  input: {
    html: string;
    isDefault: boolean;
    name: string;
    scope: { id: string; type: "domain" | "mailbox" | "user" };
  }
): Promise<{ id: string }> {
  const response = await request.post("/api/signatures", { data: input });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string };
}

type StagingDraft = {
  bcc: string[];
  cc: string[];
  forwardOfMessageId: string | null;
  from: string;
  html: string;
  id: string;
  mailboxId: string | null;
  replyToMessageId: string | null;
  signature: { id: string | null; mode: string; text: string };
  subject: string;
  text: string;
  to: string[];
  version: number;
};

async function stagingSignatureSelection(
  request: APIRequestContext,
  from: string
): Promise<{
  automaticSignatureId: string | null;
  signatures: Array<{ id: string; scope: string }>;
}> {
  const response = await request.get(`/api/v2/signatures?from=${encodeURIComponent(from)}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as {
    automaticSignatureId: string | null;
    signatures: Array<{ id: string; scope: string }>;
  };
}

async function storedMessageBodies(
  request: APIRequestContext,
  messageId: string
): Promise<{ html: string; text: string }> {
  const detailResponse = await request.get(`/api/v2/messages/${messageId}`);
  expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy();
  const detail = (await detailResponse.json()) as { textBody: string };
  const htmlResponse = await request.get(`/api/v2/messages/${messageId}/html`);
  expect(htmlResponse.ok(), await htmlResponse.text()).toBeTruthy();
  const rendered = (await htmlResponse.json()) as {
    afterQuotedHtml: string | null;
    html: string;
    quotedHtml: string | null;
  };
  const html = [rendered.html, rendered.quotedHtml, rendered.afterQuotedHtml]
    .filter((part): part is string => Boolean(part))
    .join("");
  return { html, text: detail.textBody };
}

function expectTextOrder(value: string, parts: string[]): void {
  let previous = -1;
  for (const part of parts) {
    const index = value.indexOf(part);
    expect(
      index,
      `${JSON.stringify(part)} was not found in the stored message body.`
    ).toBeGreaterThan(previous);
    previous = index;
  }
}

async function createStagingMember(
  request: APIRequestContext,
  input: { email: string; password: string }
): Promise<{ id: string; loginPassword: string; passwordSetupRequired: boolean }> {
  return createStagingUser(request, {
    ...input,
    name: "Kirill Track 1",
    role: "member"
  });
}

async function createStagingUser(
  request: APIRequestContext,
  input: {
    email: string;
    name: string;
    password: string;
    role: "admin" | "member";
  }
): Promise<{ id: string; loginPassword: string; passwordSetupRequired: boolean }> {
  const modernResponse = await request.post("/api/users", {
    data: {
      email: input.email,
      method: "temporary_password",
      name: input.name,
      role: input.role
    }
  });
  const modern = (await modernResponse.json()) as {
    error?: unknown;
    temporaryPassword?: string;
    user?: { id?: string };
  };
  if (modernResponse.status() === 201) {
    if (!modern.user?.id || !modern.temporaryPassword) {
      throw new Error(
        `Modern user creation returned an incomplete result: ${JSON.stringify(modern)}`
      );
    }
    return {
      id: modern.user.id,
      loginPassword: modern.temporaryPassword,
      passwordSetupRequired: true
    };
  }

  const rejection = JSON.stringify(modern);
  if (modernResponse.status() !== 400 || !rejection.includes("expected string")) {
    throw new Error(
      `Modern user creation failed unexpectedly (${modernResponse.status()}): ${rejection}`
    );
  }

  const legacyResponse = await request.post("/api/users", {
    data: {
      email: input.email,
      name: input.name,
      password: input.password,
      role: input.role
    }
  });
  const legacy = (await legacyResponse.json()) as { error?: unknown; id?: string };
  if (legacyResponse.status() !== 201 || !legacy.id) {
    throw new Error(
      `Legacy user creation failed (${legacyResponse.status()}): ${JSON.stringify(legacy)}`
    );
  }
  return { id: legacy.id, loginPassword: input.password, passwordSetupRequired: false };
}

async function authenticatedStagingRequest(input: {
  chosenPassword: string;
  email: string;
  user: { loginPassword: string; passwordSetupRequired: boolean };
}): Promise<APIRequestContext> {
  const request = await playwrightRequest.newContext({
    baseURL: stagingUrl,
    extraHTTPHeaders: accessHeaders()
  });
  const login = await request.post("/api/auth/sign-in/email", {
    data: {
      email: input.email,
      password: input.user.loginPassword,
      rememberMe: false
    },
    headers: { origin: stagingUrl }
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  if (input.user.passwordSetupRequired) {
    const passwordSetup = await request.post("/api/me/password", {
      data: {
        confirmPassword: input.chosenPassword,
        currentPassword: input.user.loginPassword,
        newPassword: input.chosenPassword
      },
      headers: { origin: stagingUrl }
    });
    expect(passwordSetup.ok(), await passwordSetup.text()).toBeTruthy();
  }
  return request;
}

function accessHeaders(): Record<string, string> {
  const clientId = process.env.HQBASE_STAGING_ACCESS_CLIENT_ID;
  const clientSecret = process.env.HQBASE_STAGING_ACCESS_CLIENT_SECRET;
  return clientId && clientSecret
    ? {
        origin: stagingUrl,
        "CF-Access-Client-Id": clientId,
        "CF-Access-Client-Secret": clientSecret
      }
    : { origin: stagingUrl };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for HQBase staging E2E.`);
  return value;
}
