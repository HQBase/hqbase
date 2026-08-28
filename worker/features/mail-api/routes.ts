import { Hono } from "hono";

import type { HonoApp } from "../../lib/env";
import { draftRoutes } from "../drafts/routes";
import { mailLabelRoutes } from "../labels/routes";
import { mailboxReadRoutes } from "../mailboxes/routes";
import { changeRoutes } from "../messages/change-routes";
import { conversationRoutes } from "../messages/conversation-routes";
import { attachmentRoutes, messageRoutes } from "../messages/routes";
import { sendRoutes } from "../send/routes";
import { mailSignatureRoutes } from "../signatures/routes";

export const mailApiRoutes = new Hono<HonoApp>();

mailApiRoutes.route("/mailboxes", mailboxReadRoutes);
mailApiRoutes.route("/labels", mailLabelRoutes);
mailApiRoutes.route("/messages", messageRoutes);
mailApiRoutes.route("/changes", changeRoutes);
mailApiRoutes.route("/conversations", conversationRoutes);
mailApiRoutes.route("/attachments", attachmentRoutes);
mailApiRoutes.route("/drafts", draftRoutes);
mailApiRoutes.route("/signatures", mailSignatureRoutes);
mailApiRoutes.route("/", sendRoutes);
