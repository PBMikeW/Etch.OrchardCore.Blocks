import AnchorTune from 'editorjs-anchor';

/**
 * AnchorTuneWrapper — wraps the editorjs-anchor tune to add a
 * "copy anchor link" button next to the anchor input field.
 */
export default class AnchorTuneWrapper extends AnchorTune {
  render() {
    const originalEl = super.render();

    // Find the input field inside the rendered anchor tune
    const input = originalEl.querySelector('input');
    if (!input) return originalEl;

    // Create a copy button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'anchor-tune-copy-btn';
    copyBtn.title = 'Copy anchor link';
    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const anchorValue = input.value;
      if (!anchorValue) return;

      const link = `#${anchorValue}`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
          this._showFeedback(copyBtn, 'Copied!');
        });
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this._showFeedback(copyBtn, 'Copied!');
      }
    });

    // Wrap input and button in a flex container
    const wrapper = document.createElement('div');
    wrapper.className = 'anchor-tune-input-wrapper';

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(copyBtn);

    return originalEl;
  }

  _showFeedback(btn, text) {
    const originalHTML = btn.innerHTML;
    btn.textContent = text;
    btn.classList.add('anchor-tune-copy-btn--copied');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('anchor-tune-copy-btn--copied');
    }, 1500);
  }
}
