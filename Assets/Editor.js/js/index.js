import '../css/index.scss';
import { attachPageSingletons, createBlockEditor } from './factory';
import { upgradeLegacyBlocks } from './plugins/utils/legacyMarkup';

// Flip the block-toolbar popovers upward when they would open off the bottom
// of the viewport, and open the block-settings popover under the gear button
// when it is clicked (or beside the block text for Ctrl/Cmd + "/", which has
// no button to hang under). Page-wide and idempotent, so they are registered
// once here as the bundle loads; every editor the factory makes asks again,
// which is a no-op.
attachPageSingletons();

// The factory for pages that own their editor state (the course studio):
// window.EtchBlocks.create(holder, options) -> Promise<handle>. See ./factory.
window.EtchBlocks = { create: createBlockEditor };

/**
 * The OrchardCore Blocks part/field editor: one editor bound to the hidden
 * input the form posts. A thin wrapper over the factory that keeps what the
 * edit views and other admin scripts rely on: the hidden input is written and
 * `contentpreview:render` fired on every change (and after an undo), the
 * editor joins the page-wide undo timeline, `window.__editorJSInstances[id]`
 * is `{ editor, hiddenFieldId }`, and the form's submit saves the editor.
 */
window.initializeEditorJS = (
  tenantPath,
  id,
  hiddenFieldId,
  typeName,
  partName,
  fieldName,
  placeholder,
  options = {}
) => {
  // Older callers pass no options: the server still enforces the permission.
  const allowRawBlocks = options.allowRawBlocks !== false;

  const $hiddenField = document.getElementById(hiddenFieldId);

  if (!$hiddenField) {
    return;
  }

  // No form on read-only pages (e.g. audit trail version preview) — still
  // initialise the editor so the content is visible; just skip submit wiring.
  const $form = $hiddenField.closest('form');

  const initialData = !$hiddenField.value ? {} : JSON.parse($hiddenField.value);

  // Content saved by earlier editor versions carries <font color> attributes
  // and editor-fs-* size classes that the current colour and size tools do
  // not recognise (and the admin has no CSS for the classes, so those sizes
  // are invisible here). Rewrite them to the current markup before the
  // editor renders and write the result straight back to the field, so a
  // cloned widget or any page that is saved carries the upgraded content.
  // Sizes resolve exactly as the site CSS rendered them, so nothing moves.
  if (upgradeLegacyBlocks(initialData).changed) {
    $hiddenField.value = JSON.stringify(initialData);
  }

  // The form posts this field, so every path that changes the content has to
  // write it: the editor's own onChange, and an undo (which fires none).
  const saveToField = (outputData) => {
    $hiddenField.value = JSON.stringify(outputData);
    document.dispatchEvent(new Event('contentpreview:render'));
  };

  // The editor is created, and registered in window.__editorJSInstances,
  // synchronously inside this call; the promise settles once it is ready.
  const created = createBlockEditor(document.getElementById(id), {
    data: initialData,
    onChange: saveToField,
    tenantPath,
    placeholder,
    undo: 'page',
    // Without the ManageRawBlocks permission the raw HTML tool is locked
    // (see LockedRaw in ./factory).
    allowRawBlocks,
    // The field is what the form posts, so it is written on every change
    // rather than after a quiet period.
    debounceMs: 0,
    context: {
      typeName,
      partName,
      fieldName,
      hiddenFieldId,
    },
  });

  created.catch((error) => {
    console.error(`Blocks editor #${id} failed to start`, error);
  });

  if ($form) {
    const submitForm = () => {
      $form.removeEventListener('submit', onSubmit);
      $form.submit();
    };

    // A failed save still submits: the field holds the last change written.
    const onSubmit = () => {
      created
        .then((handle) => handle.save())
        .then((outputData) => {
          $hiddenField.value = JSON.stringify(outputData);
          submitForm();
        })
        .catch((error) => {
          console.error('Blocks editor save failed', error);
          submitForm();
        });
    };

    $form.addEventListener('submit', onSubmit);
  }
};
