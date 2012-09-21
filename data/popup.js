  function showDetails(artDetails) {

    var tmplName = artDetails.status=='found' ? 'popup-found-tmpl':'popup-notfound-tmpl';
    var template = document.getElementById(tmplName).innerHTML;
    var parsed = Ashe.parse(template, artDetails);
    document.getElementById('content').innerHTML = parsed;
  }


  self.port.on("showDetails", function (artDetails) {
    showDetails(artDetails);
  });


