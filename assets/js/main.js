// main script
(function () {
  "use strict";

  // Testimonial Slider
  // ----------------------------------------
  // Swiper is not part of the bundle (no page of this site renders the
  // testimonial slider); the section is initialised only if it shows up.
  if (document.querySelector(".testimonial-slider") && typeof Swiper !== "undefined") {
    new Swiper(".testimonial-slider", {
      spaceBetween: 24,
      loop: true,
      pagination: {
        el: ".testimonial-slider-pagination",
        type: "bullets",
        clickable: true,
      },
      breakpoints: {
        768: {
          slidesPerView: 2,
        },
        992: {
          slidesPerView: 3,
        },
      },
    });
  }
})();
