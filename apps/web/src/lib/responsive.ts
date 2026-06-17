export function isTouchMobileViewport() {
  if (typeof window === "undefined") {
    return false;
  }
  const narrowViewport = window.innerWidth <= 860;
  const coarsePointer = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  return narrowViewport || coarsePointer;
}
