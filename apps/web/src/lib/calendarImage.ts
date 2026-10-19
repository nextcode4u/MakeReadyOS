/** Capture only the rendered, filtered calendar; no unit data leaves the browser. */
export async function downloadCalendarImage(node: HTMLElement, filename: string) {
  const { toBlob } = await import("html-to-image");
  await document.fonts.ready;
  // Lay out a private copy at its full scroll width. Mobile calendars deliberately
  // scroll horizontally; photographing their viewport would lose Thursday-Saturday.
  const styles = getComputedStyle(node);
  const columns = styles.gridTemplateColumns.split(" ").length;
  const panelWidth = Math.max(0, ...Array.from(node.querySelectorAll<HTMLElement>(".calendar-grid"), grid => grid.scrollWidth + 2));
  const width = Math.ceil(Math.max(node.getBoundingClientRect().width, panelWidth * columns + (parseFloat(styles.columnGap) || 0) * (columns - 1)));
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;pointer-events:none;`;
  wrapper.setAttribute("aria-hidden", "true");
  const copy = node.cloneNode(true) as HTMLElement;
  copy.removeAttribute("inert");
  copy.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  copy.querySelectorAll("[data-testid]").forEach(element => element.removeAttribute("data-testid"));
  copy.querySelectorAll('[data-calendar-export-exclude="true"]').forEach(element => element.remove());
  const selects = node.querySelectorAll("select");
  copy.querySelectorAll("select").forEach((select, index) => {
    const heading = document.createElement("strong");
    heading.textContent = selects[index].selectedOptions[0]?.textContent ?? "";
    select.replaceWith(heading);
  });
  wrapper.append(copy);
  node.parentElement!.append(wrapper);
  let blob: Blob | null;
  try {
    const height = Math.ceil(copy.scrollHeight);
    // Bound canvas memory on mobile while retaining the full calendar, not a viewport crop.
    const pixelRatio = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(12_000_000 / (width * height)));
    if (!width || !height || pixelRatio < 0.5) throw new Error("Calendar is too large to export");
    blob = await toBlob(copy, {
      width, height, pixelRatio,
      backgroundColor: styles.getPropertyValue("--calendar-cell").trim() || "#ffffff",
      preferredFontFormat: "woff2",
    });
  } finally {
    wrapper.remove();
  }
  if (!blob) throw new Error("Calendar image could not be created");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  // Give mobile browsers time to start the download before releasing its backing data.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
