export type ClientQuoteHtmlFixture = {
  client: string;
  currentText: string;
  html: string;
  quotedText: string;
};

// Reduced to the structural elements that established clients emit. The source shapes are tracked
// by Proton Mail's public messageBlockquote fixtures:
// https://github.com/ProtonMail/WebClients/tree/main/applications/mail/src/app/helpers/message/__fixtures__
export const clientQuoteHtmlFixtures: ClientQuoteHtmlFixture[] = [
  {
    client: "Gmail",
    currentText: "Current Gmail reply",
    html: `<div dir="ltr">Current Gmail reply</div><br><div class="gmail_quote"><div class="gmail_attr" dir="ltr">On Thu, Aug 20, 2026, Pat &lt;pat@example.com&gt; wrote:<br></div><blockquote class="gmail_quote"><div dir="ltr">Earlier Gmail message</div></blockquote></div>`,
    quotedText: "Earlier Gmail message"
  },
  {
    client: "Proton Mail",
    currentText: "Current Proton reply",
    html: `<div>Current Proton reply</div><div class="protonmail_quote">------- Original Message -------<br>On Thursday, August 20th, 2026, Pat &lt;pat@example.com&gt; wrote:<br><blockquote class="protonmail_quote" type="cite"><div>Earlier Proton message</div></blockquote></div>`,
    quotedText: "Earlier Proton message"
  },
  {
    client: "Outlook",
    currentText: "Current Outlook reply",
    html: `<div>Current Outlook reply</div><hr tabindex="-1" style="display:inline-block;width:98%"><div id="divRplyFwdMsg" dir="ltr"><b>From:</b> Pat &lt;pat@example.com&gt;<br><b>Sent:</b> Thursday<br><b>Subject:</b> Earlier</div><div dir="ltr">Earlier Outlook message</div>`,
    quotedText: "Earlier Outlook message"
  },
  {
    client: "Apple Mail",
    currentText: "Current Apple reply",
    html: `<div>Current Apple reply</div><blockquote type="cite"><div>On Aug 20, 2026, at 10:53 PM, Pat &lt;pat@example.com&gt; wrote:</div><div>Earlier Apple message</div></blockquote>`,
    quotedText: "Earlier Apple message"
  },
  {
    client: "Thunderbird",
    currentText: "Current Thunderbird reply",
    html: `<p>Current Thunderbird reply</p><div class="moz-cite-prefix">On 8/20/26 10:53 PM, Pat wrote:</div><blockquote type="cite"><p>Earlier Thunderbird message</p></blockquote>`,
    quotedText: "Earlier Thunderbird message"
  },
  {
    client: "Yahoo Mail",
    currentText: "Current Yahoo reply",
    html: `<div>Current Yahoo reply</div><div class="yahoo_quoted"><div>On Thursday, Pat &lt;pat@example.com&gt; wrote:</div><blockquote><div>Earlier Yahoo message</div></blockquote></div>`,
    quotedText: "Earlier Yahoo message"
  }
];
