var widgets = require("widget");
var tabs = require("tabs");
var pageMod = require("page-mod");
var Request = require("request").Request;

var data = require("self").data; 
var notifications = require("notifications");

/* NOTE: TabTracker just ripped from chrome version. For firefox, we're not really
 * using tabs as the key - tabid is just a unique ID generated during pageMod onAttach.
 * TODO: maybe factor out common bits between chrome and firefox (and possibly safari), and fix up the terminology!
 */

/* associative array holding tab states and details retreived from unsourced.org
 * indexed by tabid.
 *
 * There are two processes happening in parallel:
 *  1) the normal loading of the web page
 *  2) the lookup request to unsourced.org
 *
 * the lookup is initiated as early as possible - before the page is ready to be
 * displayed to the user. We need both processes to finish before we can show
 * label overlays or popup windows, so all the progress is handled by
 * updateTabstate(), which invokes the displaying when conditions are right.
 *
 * TabTracker is accessed directly by popup window to grab the details downloaded
 * about the article
 */  
TabTracker = {};


function updateTabState(tabid, values) {
  if(TabTracker[tabid] === undefined) {
    TabTracker[tabid] = {lookup: '', dom: '', artDetails: {}};
  }
  var state = TabTracker[tabid];

  var before = {dom: state.dom, lookup: state.lookup};

  for( var v in values ) {
    state[v] = values[v];
  }


  /* perform any side effects resulting from this state change */
  console.log( "tab " + tabid + " state change: " + before.lookup +"," + before.dom + " => " + state.lookup + "," + state.dom);
  if(state.lookup=='done' && state.dom=='completed') {
    if(before.lookup!='done' || before.dom!='completed') {
      // both the unsourced.org lookup and the page itself are ready.
      // thunderbirds are go!
      show_results(tabid, state.artDetails);
    }
  }
}





function restoreOptions() {
  return {'search_server':'http://unsourced.org'}
}


function doLookup(tabid,url) {
  var options = restoreOptions();
  var search_url = options.search_server + '/api/lookup?url=' + encodeURIComponent(url);
  console.log("doLookup(",tabid,url,")");

  updateTabState(tabid, {lookup:'pending'});

  var req = Request({
    url: search_url,
    onComplete: function (response) {
      if( response.status==200) {
        var result = response.json;
        updateTabState(tabid, {lookup:'done', artDetails:result});
      } else {
        updateTabState(tabid, {lookup:'failed'});
      }
    }
  }).get();
}





var widget = widgets.Widget({
  id: "mozilla-link",
  label: "Mozilla website",
  contentURL: "http://www.mozilla.org/favicon.ico",
  onClick: function() {
    tabs.open("http://www.mozilla.org/");
  }
});



/* show stuff ! */
var show_results = function(tabid, details) {
  var worker = TabTracker[tabid].worker;
  console.log("OH YEAH!", tabid, details);
  worker.port.emit('augmentArticle', details);





notifications.notify({
  title: "Jabberwocky",
  text: "'Twas brillig, and the slithy toves",
  data: "did gyre and gimble in the wabe",
  onClick: function (data) {
    console.log(data);
    // console.log(this.data) would produce the same result.
  }
});

}




var uniqId = 0;

function installPageMod() {
  pageMod.PageMod({
    include: "http://www.dailymail.co.uk/*",
    contentScriptWhen: 'start',
    /* contentScriptWhen: 'ready', */ /* would prefer 'start', but see https://bugzilla.mozilla.org/show_bug.cgi?id=641457 */
    attachTo: 'top',  /* only attach to top, not iframes */
    contentScriptFile: [data.url("jquery.js"),data.url("content.js")],
    contentStyleFile: [data.url("unsourced.css")],
    onAttach: function(worker) {

      var tabid = uniqId++;

      updateTabState(tabid,{dom:'committed','worker':worker}); 
      doLookup(tabid,worker.url);

  /*
      var det = { 'status': 'found',
        'labels': [ {'icon_url':'/favicon.ico', 'prettyname': 'Wibble', 'description': "This is a description" } ]
      };
  */
      worker.port.on('contentReady', function() {
        updateTabState(tabid,{dom:'completed'}); 
       /* worker.port.emit('augmentArticle', det);*/
      });
    }
  });

}



installPageMod();

console.log("F.A.B.");


