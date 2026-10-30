import MarkdownIt from "markdown-it";

// Reports may contain formatting, but never executable HTML or remote image loads.
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false }).disable("image");
markdown.validateLink = value => {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
};

export function reportMarkdown(value: string) {
  return markdown.render(value);
}
