// faceless_builder_media.js
// Handles Media Library button wiring and media picker integration for Faceless Builder App

import { openMediaPicker } from './assets/js/media-picker.js';

document.addEventListener('DOMContentLoaded', function() {
  const mediaLibraryBtn = document.getElementById('mediaLibraryBtn');
  if (mediaLibraryBtn) {
    mediaLibraryBtn.addEventListener('click', () => {
      openMediaPicker({
        onSelect: (media) => {
          if (!media || !media.url) {
            alert('Invalid media selection.');
            return;
          }
          if (!window.editor) return;
          // Enhanced: support all file types with preview/icon
          let component = null;
          const fileName = media.name || 'File';
          const fileType = media.type || '';
          if (fileType.startsWith('image')) {
            // Image preview
            component = {
              type: 'image',
              src: media.url,
              alt: fileName,
            };
          } else if (fileType.startsWith('audio')) {
            // Audio player
            component = {
              tagName: 'audio',
              attributes: { controls: true, src: media.url, style: 'width:100%;margin:8px 0;' },
              content: 'Your browser does not support the audio element.',
            };
          } else if (fileType.startsWith('video')) {
            // Video player
            component = {
              tagName: 'video',
              attributes: { controls: true, src: media.url, style: 'max-width:100%;margin:8px 0;' },
              content: 'Your browser does not support the video tag.',
            };
          } else {
            // Generic file: show icon and download link
            let icon = '📄';
            if (fileType.includes('pdf')) icon = '📄';
            else if (fileType.includes('zip') || fileType.includes('rar')) icon = '🗜️';
            else if (fileType.includes('csv') || fileType.includes('xls')) icon = '📊';
            else if (fileType.includes('doc') || fileType.includes('word')) icon = '📝';
            else if (fileType.includes('ppt')) icon = '📈';
            else if (fileType.includes('txt')) icon = '📄';
            component = {
              tagName: 'div',
              attributes: { style: 'display:flex;align-items:center;gap:8px;padding:8px 0;' },
              components: [
                {
                  tagName: 'span',
                  attributes: { style: 'font-size:22px;' },
                  content: icon,
                },
                {
                  tagName: 'a',
                  attributes: {
                    href: media.url,
                    download: fileName,
                    target: '_blank',
                    style: 'color:#8b5cf6;text-decoration:underline;font-weight:700;word-break:break-all;'
                  },
                  content: fileName,
                }
              ]
            };
          }
          // Insert the component into the editor
          window.editor.runCommand('core:component-add', component);
        }
      });
    });
  }
});
