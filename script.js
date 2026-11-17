"use strict";

(() => {
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");
  const year = document.getElementById("currentYear");

  if (year) year.textContent = String(new Date().getFullYear());

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
    });

    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "打开导航");
      });
    });
  }

  const revealTargets = document.querySelectorAll(
    ".focus-card, .project-card, .timeline-item, .stack-group, .about-panel"
  );

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealTargets.forEach((element) => {
      element.classList.add("reveal");
      observer.observe(element);
    });
  }

  const sections = document.querySelectorAll("main section[id]");
  const navLinks = document.querySelectorAll('.main-nav a[href^="#"]');

  if ("IntersectionObserver" in window && sections.length && navLinks.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.classList.toggle(
            "active",
            link.getAttribute("href") === "#" + entry.target.id
          );
        });
      });
    }, { rootMargin: "-30% 0px -60% 0px" });

    sections.forEach((section) => sectionObserver.observe(section));
  }
})();