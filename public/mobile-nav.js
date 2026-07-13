(function () {
  const desktopSidebar = document.querySelector("aside");

  if (!desktopSidebar || document.getElementById("mobile-app-header")) {
    return;
  }

  const navLinks = Array.from(desktopSidebar.querySelectorAll("nav a")).map((link) => {
    const icon = link.querySelector("img");

    return {
      href: link.getAttribute("href") || "#",
      label: link.textContent.trim(),
      icon: icon ? icon.getAttribute("src") : "",
    };
  });

  const currentPath = window.location.pathname;
  const mobileHeader = document.createElement("header");
  mobileHeader.id = "mobile-app-header";
  mobileHeader.className = "sticky top-0 z-40 border-b border-slate-200 bg-white md:hidden";
  mobileHeader.innerHTML = `
    <div class="flex h-14 items-center justify-between px-4">
      <a class="flex min-w-0 items-center" href="/" aria-label="Back to AfriSettle website">
        <img class="h-8 w-36 object-contain object-left" src="/assets/logo/afrisettle-wordmark.png" alt="AfriSettle" />
      </a>
      <button id="mobile-menu-button" class="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white" type="button" aria-controls="mobile-nav-drawer" aria-expanded="false">
        <img class="h-5 w-5" src="/assets/ui/menu.svg" alt="" />
        <span class="sr-only">Open navigation</span>
      </button>
    </div>
  `;

  const drawer = document.createElement("div");
  drawer.id = "mobile-nav-drawer";
  drawer.className = "fixed inset-0 z-50 hidden md:hidden";
  drawer.innerHTML = `
    <button id="mobile-nav-backdrop" class="absolute inset-0 bg-slate-950/50" type="button" aria-label="Close navigation"></button>
    <aside class="absolute inset-y-0 left-0 flex w-[min(82vw,320px)] flex-col bg-[#06172d] text-white shadow-2xl">
      <div class="flex h-14 items-center justify-between px-4">
        <a class="flex min-w-0 items-center" href="/" aria-label="Back to AfriSettle website">
          <img class="h-8 w-36 object-contain object-left brightness-0 invert" src="/assets/logo/afrisettle-wordmark.png" alt="AfriSettle" />
        </a>
        <button id="mobile-nav-close" class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xl font-black" type="button" aria-label="Close navigation">&times;</button>
      </div>
      <nav class="mt-3 space-y-1 px-4">
        ${navLinks
          .map((item) => {
            const active = item.href === currentPath;
            const activeClass = active
              ? "bg-[#2443d8] text-white shadow-lg shadow-blue-950/30"
              : "text-slate-300 hover:bg-white/10";
            const icon = item.icon
              ? `<img class="h-4 w-4 brightness-0 invert ${active ? "" : "opacity-80"}" src="${item.icon}" alt="" />`
              : "";

            return `<a class="mobile-nav-link flex h-[42px] items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${activeClass}" href="${item.href}">${icon}${item.label}</a>`;
          })
          .join("")}
      </nav>
      <a class="mobile-nav-link mx-4 mt-auto flex h-[42px] items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-300 transition-colors hover:bg-white/10" href="/">
        <img class="h-4 w-4 brightness-0 invert opacity-80" src="/assets/ui/external-link.svg" alt="" />Back to website
      </a>
      <div class="mx-4 mt-2 rounded-[14px] border border-white/15 bg-white/[0.04] p-3">
        <p class="text-sm font-black">AfriSettle Merchant</p>
        <p class="mt-1 text-xs leading-4 text-slate-300">Manage invoices, payments, wallets, and settings.</p>
      </div>
      <div class="m-4 border-t border-white/10 pt-3 text-xs font-semibold text-slate-400">Secured by Circle &middot; Built on Base</div>
    </aside>
  `;

  document.body.insertBefore(mobileHeader, document.body.firstChild);
  document.body.appendChild(drawer);

  const openButton = document.getElementById("mobile-menu-button");
  const closeButton = document.getElementById("mobile-nav-close");
  const backdrop = document.getElementById("mobile-nav-backdrop");

  function openDrawer() {
    drawer.classList.remove("hidden");
    openButton.setAttribute("aria-expanded", "true");
    document.body.classList.add("overflow-hidden");
  }

  function closeDrawer() {
    drawer.classList.add("hidden");
    openButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("overflow-hidden");
  }

  openButton.addEventListener("click", openDrawer);
  closeButton.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);

  drawer.querySelectorAll(".mobile-nav-link").forEach((link) => {
    link.addEventListener("click", closeDrawer);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.classList.contains("hidden")) {
      closeDrawer();
    }
  });
})();
