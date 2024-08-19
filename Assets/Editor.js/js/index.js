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
const ColorPlugin = require('editorjs-text-color-plugin');
const AlignmentTuneTool = require('editorjs-text-alignment-blocktune');
import textSize from './plugins/text-size';
import MediaLibrary from './plugins/mediaLibrary';
import Undo from 'editorjs-undo';

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

  const editor = new EditorJS({
    onReady: () => {
      new Undo({ editor });
    },
    holder: id,
    placeholder: placeholder || 'Click here to start entering content blocks..',
    tools: {
      table: {
        class: Table,
        inlineToolbar: true,
        config: {
          rows: 2,
          cols: 3,
        },
      },
      anchorTune: AnchorTune,
      anyTune: {
        class: AlignmentTuneTool,
        config: {
          default: "left",
          blocks: {
            header: 'center',
            list: 'left'
          }
        },
      },
      Color: {
        class: ColorPlugin,
        config: {
          colorCollections: ['#F8F8F8', '#D1D1D1', '#72808A', '#FFCD00', '#EF4123', '#002D6A', '#FFF', '#000', '#99ABC3'],
          defaultColor: '#002D6A',
          type: 'text',
          customPicker: true
        }
      },
      Marker: {
        class: ColorPlugin,
        config: {
          defaultColor: '#FFBF00',
          type: 'marker',
          icon: `<svg fill="#000000" height="200px" width="200px" version="1.1" id="Icons" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M17.6,6L6.9,16.7c-0.2,0.2-0.3,0.4-0.3,0.6L6,23.9c0,0.3,0.1,0.6,0.3,0.8C6.5,24.9,6.7,25,7,25c0,0,0.1,0,0.1,0l6.6-0.6 c0.2,0,0.5-0.1,0.6-0.3L25,13.4L17.6,6z"></path> <path d="M26.4,12l1.4-1.4c1.2-1.2,1.1-3.1-0.1-4.3l-3-3c-0.6-0.6-1.3-0.9-2.2-0.9c-0.8,0-1.6,0.3-2.2,0.9L19,4.6L26.4,12z"></path> </g> <g> <path d="M28,29H4c-0.6,0-1-0.4-1-1s0.4-1,1-1h24c0.6,0,1,0.4,1,1S28.6,29,28,29z"></path> </g> </g></svg>`
        }
      },
      delimiter: Delimiter,
      fontSize0point8: {
        class: textSize,
        config: {
          cssClass: "editor-fs-0point8",
          buttonText: ".8"
        }
      },
      fontSize0point9: {
        class: textSize,
        config: {
          cssClass: "editor-fs-0point9",
          buttonText: ".9"
        }
      },
      fontSize1point0: {
        class: textSize,
        config: {
          cssClass: "editor-fs-1point0",
          buttonText: "1.0"
        }
      },
      fontSize1point1: {
        class: textSize,
        config: {
          cssClass: "editor-fs-1point1",
          buttonText: "1.1"
        }
      },
      fontSize1point2: {
        class: textSize,
        config: {
          cssClass: "editor-fs-1point2",
          buttonText: "1.2"
        }
      },
      fontSize1point3: {
        class: textSize,
        config: {
          cssClass: "editor-fs-1point3",
          buttonText: "1.3"
        }
      },
      embed: {
        class: Embed,
        config: {
          services: {
            youtube: true,
          },
        },
        inlineToolbar: true,
      },
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
    },
    tunes: ['anchorTune'],
    tunes: ['anyTune'],
    data: !$hiddenField.value ? {} : JSON.parse($hiddenField.value),

    onChange: () => {
      editor
        .save()
        .then((outputData) => {
          $hiddenField.value = JSON.stringify(outputData);
          document.dispatchEvent(new Event('contentpreview:render'));
        })
        .catch((error) => { });
    },
  });

  const onSubmit = (e) => {
    editor
      .save()
      .then((outputData) => {
        $hiddenField.value = JSON.stringify(outputData);
        $form.removeEventListener('submit', onSubmit);
        $form.submit();
      })
      .catch((error) => { });
  };

  $form.addEventListener('submit', onSubmit);
};
//# sourceMappingURL=/scripts/editorjs/admin.js.map
