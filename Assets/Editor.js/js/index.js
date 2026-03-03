import Delimiter from '@editorjs/delimiter';
import Embed from '@editorjs/embed';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Paragraph from '@editorjs/paragraph';
import Raw from '@editorjs/raw';
import Quote from '@editorjs/quote';
import Table from '@editorjs/table';
import EditorJS from '@editorjs/editorjs';
import AnchorTune from 'editorjs-anchor';

import LinkTool from './plugins/link';
import FontSizeTool from './plugins/fontSize';
import FontColorTool from './plugins/fontColor';
import MediaLibrary from './plugins/mediaLibrary';
import KbButton from './plugins/kbButton';
import Breadcrumb from './plugins/breadcrumb';

window.initializeEditorJS = (
  tenantPath,
  id,
  hiddenFieldId,
  typeName,
  partName,
  fieldName,
  placeholder
) => {
  const $hiddenField = document.getElementById(hiddenFieldId);

  if (!$hiddenField) {
    return;
  }

  const $form = $hiddenField.closest('form');

  if (!$form) {
    return;
  }

    const baseTools = {
        anchorTune: {
            class: AnchorTune,
        },
        breadcrumb: Breadcrumb,
        delimiter: Delimiter,
        embed: {
            class: Embed,
            config: {
                services: {
                    'twitch-channel': true,
                    'twitch-video': true,
                    vimeo: true,
                    youtube: true,
                },
            },
            inlineToolbar: true,
        },
        fontColor: FontColorTool,
        fontSize: FontSizeTool,
        header: {
            class: Header,
            inlineToolbar: true,
        },
        image: {
            class: MediaLibrary,
            config: {
                id,
            },
        },
        kbButton: KbButton,
        link: {
            class: LinkTool,
            config: {
                fieldName,
                partName,
                typeName,
                tenantPath,
            },
        },
        list: {
            class: List,
            inlineToolbar: true,
        },
        paragraph: {
            class: Paragraph,
            inlineToolbar: true,
            config: {
                preserveBlank: true,
            },
        },
        quote: Quote,
        raw: Raw,
        table: {
            class: Table,
            inlineToolbar: true,
            config: {
                rows: 2,
                cols: 3,
            },
        },
    };

    const editor = new EditorJS({
        holder: id,

        placeholder: placeholder || 'Enter your content here...',

        tools: baseTools,

        tunes: ['anchorTune'],

        data: !$hiddenField.value ? {} : JSON.parse($hiddenField.value),

        onChange: () => {
            editor
                .save()
                .then((outputData) => {
                    $hiddenField.value = JSON.stringify(outputData);
                    document.dispatchEvent(new Event('contentpreview:render'));
                })
                .catch((error) => {});
        },
    });

    // Expose editor instance so external code (e.g. block drag-and-drop) can
    // use the Blocks API (insert, delete, move, update).
    if (!window.__editorJSInstances) window.__editorJSInstances = {};
    window.__editorJSInstances[id] = { editor, hiddenFieldId };

    const onSubmit = (e) => {
        editor
            .save()
            .then((outputData) => {
                $hiddenField.value = JSON.stringify(outputData);
                $form.removeEventListener('submit', onSubmit);
                $form.submit();
            })
            .catch((error) => {});
    };

    $form.addEventListener('submit', onSubmit);
};
