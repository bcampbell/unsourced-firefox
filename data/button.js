
function reconfig(params) {
//  console.log("button.js: reconfig");
  var icons = {
    'attention': "nag.gif",
    'unknown': "unsourced.png",
    'good': "sourced.png"
  };

  var icon_img = document.getElementById("icon-img");
  icon_img.src = icons[params.icon];
}


self.port.on("reconfig", reconfig);

