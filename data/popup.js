function display(tmplName,params) {
    var template = document.getElementById(tmplName).innerHTML;
    var parsed = Ashe.parse(template, params);
    document.getElementById('content').innerHTML = parsed;
  }

self.port.on("showDetails", function (artDetails) {
  display('popup-details-tmpl', artDetails);
});

self.port.on("showNoDetails", function (stuff) {
  display('popup-no-details-tmpl', stuff);
});



