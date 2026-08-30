export { splitQuotedText } from "../../../shared/message-quote";

export function hasMessageHtmlContent(value: string): boolean {
  if (!value) return false;
  if (typeof DOMParser === "undefined") return true;

  const document = new DOMParser().parseFromString(value, "text/html");
  if ((document.body.textContent?.trim() ?? "").length > 0) return true;
  if (document.body.querySelector("img, video, svg, a, table, .proton-image-anchor")) return true;
  return Array.from(document.body.querySelectorAll("[style]")).some((element) =>
    element.getAttribute("style")?.includes("url(")
  );
}
