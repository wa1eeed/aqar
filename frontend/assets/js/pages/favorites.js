/* صفحة المفضلة */
(function (MZ) {
  var ui = MZ.ui; ui.mount('');
  var el = document.querySelector('[data-favs]');
  function draw() {
    MZ.api.getMany(ui.fav.list()).then(function (items) {
      el.innerHTML = items.length ? items.map(function (p) { return ui.card(p); }).join('') :
        '<div class="empty" style="grid-column:1/-1">' + ui.icon('heart') + '<h3>لا توجد عقارات محفوظة بعد</h3><p>اضغط على أيقونة القلب في أي عقار لحفظه هنا والرجوع إليه لاحقاً.</p><a class="btn btn--primary" href="/properties">تصفّح العقارات</a></div>';
    });
  }
  document.addEventListener('mz:fav', draw);
  draw();
})(window.MZ);
