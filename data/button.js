
function reconfig(params) {
  console.log("button.js: reconfig");
  var icons = {
    'missingsources': "nag.gif",
    'unsourced': "unsourced.png",
    'sourced': "sourced.png"
  };

  var icon_img = document.getElementById("icon-img");
  icon_img.src = icons[params.icon];
}


self.port.on("reconfig", reconfig);

