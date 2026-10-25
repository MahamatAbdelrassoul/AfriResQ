self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const screen = event.notification.data?.screen || "";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all.find((client) => client.url.startsWith(self.location.origin));
    if (open) {
      open.postMessage({ type: "afriresq-go", screen });
      return open.focus();
    }
    const hash = screen ? `#/${screen}` : "#/home";
    return self.clients.openWindow(`${self.location.origin}/${hash}`);
  })());
});
