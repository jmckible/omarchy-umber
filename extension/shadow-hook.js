// Runs in the page's MAIN world at document_start: announces every
// imperatively-attached open shadow root so content.js (isolated world) can
// adopt the site sheets into it. Declarative shadow roots never call
// attachShadow — content.js discovers those by scanning.
{
  const original = Element.prototype.attachShadow
  Element.prototype.attachShadow = function (init) {
    const root = original.call(this, init)
    if (init && init.mode === "open")
      this.dispatchEvent(new CustomEvent("omatheme-shadow", { bubbles: true, composed: true }))
    return root
  }
}
