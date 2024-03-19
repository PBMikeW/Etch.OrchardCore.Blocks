import Delimiter from '@editorjs/delimiter';
import Embed from '@editorjs/embed';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Paragraph from '@editorjs/paragraph';
import Raw from '@editorjs/raw';
import Quote from '@editorjs/quote';
import Table from '@editorjs/table';
import EditorJS from '@editorjs/editorjs';

import LinkTool from './plugins/link';
import textColor from './plugins/text-color';
import textSize from './plugins/text-size';
import MediaLibrary from './plugins/mediaLibrary';
import Button from './plugins/button';

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
            button: {
                class: Button,
                config: {
                    color: {
                        "Blue" : "stdbluebutton",
                        "Red" : "stdredbutton",
                        "White" : "stdwhitebutton"
                    }
                }
            },
        Color: {
          class: textColor,
            config: {
              colorCollections: ['#F8F8F8', '#D1D1D1', '#72808A', '#FFCD00', '#EF4123', '#002D6A', '#FFF', '#000', '#99ABC3'],
              defaultColor: '#002D6A',
              type: 'text',
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
//# sourceMappingURL=/scripts/editorjs/admin.js.map
