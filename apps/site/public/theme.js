// Apply dark mode before paint (follows the device; no flash). Loaded blocking from <head>.
if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("dark");
