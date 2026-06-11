// Shared media picker for Faceless Animal Studios member area
// Usage: openMediaPicker({ onSelect: (media) => { ... } })

export function openMediaPicker({ onSelect }) {
  // Open my-media.html as a modal or new window (for demo, use window.open)
  // In production, use a modal/iframe for better UX
  window.__mediaPickerCallback = function(media) {
    if (onSelect) onSelect(media);
    delete window.__mediaPickerCallback;
  };
  window.open('my-media.html', 'mediaPicker', 'width=420,height=600');
}

// For iframe/modal integration, you could instead inject the picker as a sheet/modal
// and communicate via postMessage or direct callback.
