<script type="module">
    import { Editor } from 'https://esm.sh/@tiptap/core@2.11.5?target=es2020';
    import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.11.5?target=es2020';
    import Image from 'https://esm.sh/@tiptap/extension-image@2.11.5?target=es2020';

    const contentInput = document.getElementById('content_html');
    const editorElement = document.getElementById('tiptap-editor');
    const form = document.getElementById('post-form');
    const statusSelect = document.getElementById('status-select');
    const publishedWrapper = document.getElementById('published-at-wrapper');

    if (contentInput && editorElement && form) {
        const editor = new Editor({
            element: editorElement,
            extensions: [
                StarterKit,
                Image.configure({
                    inline: false,
                    allowBase64: false,
                }),
            ],
            content: contentInput.value || '<p></p>',
            onUpdate: ({ editor }) => {
                contentInput.value = editor.getHTML();
            },
        });

        const togglePublishedAt = () => {
            if (!statusSelect || !publishedWrapper) {
                return;
            }
            publishedWrapper.style.display = statusSelect.value === 'published' ? '' : 'none';
        };

        togglePublishedAt();
        statusSelect?.addEventListener('change', togglePublishedAt);

        const commandMap = {
            bold: () => editor.chain().focus().toggleBold().run(),
            italic: () => editor.chain().focus().toggleItalic().run(),
            strike: () => editor.chain().focus().toggleStrike().run(),
            h2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            bulletList: () => editor.chain().focus().toggleBulletList().run(),
            orderedList: () => editor.chain().focus().toggleOrderedList().run(),
            blockquote: () => editor.chain().focus().toggleBlockquote().run(),
        };

        document.querySelectorAll('#editor-toolbar [data-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-action');
                if (action && commandMap[action]) {
                    commandMap[action]();
                }
            });
        });

        const imageInput = document.getElementById('editor-image-input');
        const uploadImageButton = document.getElementById('upload-image-btn');
        const uploadEndpoint = @json(route('admin.posts.upload-image'));
        const csrfToken = @json(csrf_token());

        uploadImageButton?.addEventListener('click', () => imageInput?.click());

        imageInput?.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                return;
            }

            const formData = new FormData();
            formData.append('image', file);

            uploadImageButton.disabled = true;
            uploadImageButton.textContent = 'กำลังอัปโหลด...';

            try {
                const response = await fetch(uploadEndpoint, {
                    method: 'POST',
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error('Upload failed');
                }

                const data = await response.json();
                if (data.url) {
                    editor.chain().focus().setImage({ src: data.url }).run();
                }
            } catch (error) {
                alert('อัปโหลดรูปไม่สำเร็จ');
            } finally {
                uploadImageButton.disabled = false;
                uploadImageButton.textContent = 'รูปภาพ';
                imageInput.value = '';
            }
        });

        form.addEventListener('submit', () => {
            contentInput.value = editor.getHTML();
        });
    }
</script>
