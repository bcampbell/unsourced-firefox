var widget = require("widget");
var tabs = require("tabs");
var pageMod = require("page-mod");
var Request = require("request").Request;
var Panel = require("panel").Panel;

var data = require("self").data; 
var notifications = require("notifications");


/* NOTES:
 * we've got a couple of things to track for each augmented page:
 * 1) the lookup request to unsourced.org. We want to kick this off as early
 *    as we can.
 * 2) the state of the page content. We can't display any overlays until the
 *    page is ready.
 * We track the states of these by adding an object to the tab object.
 */

function initState(worker) {
  if(!worker.tab.unsourced) {
    worker.tab.unsourced = {contentReady: false, lookupReady: false };
  }
}


function updateState(worker, values) {
  var state = worker.tab.unsourced;

  // take a copy
  var before = {};
  for( var v in state ) {
    before[v] = state[v];
  }

  for( var v in values ) {
    state[v] = values[v];
  }

  /* console.log("state change: " + JSON.stringify(before) + "\n => \n" + JSON.stringify(state) ); */

  /* perform any side effects resulting from this state change */
  if(state.lookupReady && state.contentReady ) {
    if( !(before.lookupReady && before.contentReady) ) {
      // both the unsourced.org lookup and the page itself are ready.
      // thunderbirds are go!
      show_results(worker);
    }
  }
}





function restoreOptions() {
  return {'search_server':'http://unsourced.org'}
}


function doLookup(worker,url) {
  var options = restoreOptions();
  var search_url = options.search_server + '/api/lookup?url=' + encodeURIComponent(url);

  var req = Request({
    url: search_url,
    onComplete: function (response) {
      if( response.status==200) {
        updateState(worker, {artDetails: response.json, lookupReady: true});
      } else {
        //TODO: indicate error
        //updateState(worker, {lookup:'failed'});
      }
    }
  }).get();
}




/* show stuff ! */
var show_results = function(worker) {
  var details = worker.tab.unsourced.artDetails;
  console.log("Display details:", details);

  worker.port.emit('augmentArticle', details);

  updateWidgetView(worker.tab);

}




function installPageMod() {
  pageMod.PageMod({
    include: "http://www.dailymail.co.uk/*",
    contentScriptWhen: 'start',
    /* contentScriptWhen: 'ready', */ /* would prefer 'start', but see https://bugzilla.mozilla.org/show_bug.cgi?id=641457 */
    attachTo: 'top',  /* only attach to top, not iframes */
    contentScriptFile: [data.url("jquery.js"),data.url("content.js")],
    contentStyleFile: [data.url("unsourced.css")],
    onAttach: function(worker) {
      // we store some extra state on the tab
      initState(worker);

      worker.port.on('contentReady', function() {
        updateState(worker,{contentReady: true});
      });

      doLookup(worker,worker.url);
    }
  });

}


unsourcedWidget = widget.Widget({
  id: "unsourced-widget",
  label: "Foo.",
  contentURL: "http://www.mozilla.org/favicon.ico",
});



function updateWidgetView(tab) {
  var view = unsourcedWidget.getView(tab.window);
  if( !view ) {
    return;
  }

  if(!tab.unsourced) {
    return;
  }
  if(!tab.unsourced.artDetails) {
    return;
  }

  var details = tab.unsourced.artDetails;
  view.label = "X sources, Y labels";

  view.panel = Panel( {
    contentURL: data.url("popup.html"),
    contentScriptFile: [data.url("ashe.js"),data.url("popup.js")]
  });

  view.panel.on('show', function() {
     view.panel.port.emit('showDetails', details);
  });
}



tabs.on('activate', updateWidgetView);


installPageMod();

console.log("F.A.B.");
// open an article with known data
tabs.open("http://www.dailymail.co.uk/health/article-2199323/Why-fortified-bowl-soup-mothers-key-preventing-childhood-asthma.html");
