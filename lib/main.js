var widget = require("widget");
var tabs = require("tabs");
var pageMod = require("page-mod");
var Request = require("request").Request;
var Panel = require("panel").Panel;
var MatchPattern = require("match-pattern").MatchPattern;
var data = require("self").data; 
var notifications = require("notifications");

var news_sites = require("news_sites");

/* NOTES:
 * we've got a couple of things to track for each augmented page:
 * 1) the lookup request to unsourced.org. We want to kick this off as early
 *    as we can.
 * 2) the state of the page content. We can't display any overlays until the
 *    page is ready.
 * We track the states of these by adding an object to the tab object.
 */

function UnsourcedState(goFunc) {
  this._contentReady = false;
  this._lookupReady = false;
  this._goFunc = goFunc;
  this.artDetails = {};
}

UnsourcedState.prototype.lookupFinished = function(details) {
  console.log("lookupFinished");
  if(this._lookupReady!=true) {
    this.artDetails = details;
    this._lookupReady = true;
    if(this._contentReady) {
      this._goFunc();
    } 
  }
};

UnsourcedState.prototype.contentReady = function() {
  console.log("contentReady");
  if(this._contentReady!=true) {
    this._contentReady = true;
    if(this._lookupReady) {
      this._goFunc();
    } 
  }
};

UnsourcedState.prototype.startLookup = function(url) {
  var state = this;
  var options = restoreOptions();
  var search_url = options.search_server + '/api/lookup?url=' + encodeURIComponent(url);

  console.log("startLookup("+url+")");
  var req = Request({
    url: search_url,
    onComplete: function (response) {
      if( response.status==200) {
        state.lookupFinished(response.json);
      } else {
        //TODO: indicate error
        // state.lookupFailed();
      }
    }
  }).get();
};



function restoreOptions() {
  return {'search_server':'http://unsourced.org'};
}


var show_results = function(worker) {
  var details = worker.tab.unsourced.artDetails;
  worker.port.emit('augmentArticle', details);
  if(tabs.activeTab===worker.tab) {
    updateWidgetView(worker.tab);
  }
};



function buildMatchPatterns(sites) {

  return sites.map(function(site) {
    var pat = site;
    var wild_host = (pat[0]=='.');
    var wild_path = (pat.slice(-3)=='...');

    if(wild_host) {
      pat = pat.slice(1);
    }
    if(wild_path) {
      pat = pat.slice(0,-3);
    }

    pat = pat.replace( /[.]/g, "[.]");

    if(wild_host) {
      pat = '[^/]*' + pat;
    }

    pat = "https?://" + pat + '.*';

    return new RegExp(pat);
  });
}


function installPageMod() {

  var matchy = buildMatchPatterns(news_sites.sites);

  pageMod.PageMod({
    include: matchy,
    contentScriptWhen: 'start',
    attachTo: 'top',  // only attach to top, not iframes
    contentScriptFile: [data.url("jquery.js"),data.url("content.js")],
    contentStyleFile: [data.url("unsourced.css")],
    onAttach: function(worker) {
      // we store some extra state on the tab
      var state = new UnsourcedState(function () {show_results(worker);});
      worker.tab.unsourced = state;
      worker.port.on('contentReady', function () {state.contentReady();});
      state.startLookup(worker.url);
      if(tabs.activeTab===worker.tab) {
        updateWidgetView(worker.tab);
      }
    }
  });
}

unsourcedPopup = Panel( {
    contentURL: data.url("popup.html"),
    contentScriptFile: [data.url("ashe.js"),data.url("popup.js")]
  });

unsourcedWidget = widget.Widget({
  id: "unsourced-widget",
  label: "foo",
  content: "foo",
  panel: unsourcedPopup
});



function updateWidgetView(tab) {
  var view = unsourcedWidget.getView(tab.window);

  var icon;
  var msg;
  var showFunc;

  var submit_url = restoreOptions().search_server + "/addarticle?url=" + encodeURIComponent(tab.url);

  if(tab.unsourced) {
    var state = tab.unsourced;
    if(state._lookupReady) {
      if(state.artDetails.status=='found') {
        icon = data.url("sourced.png");
        msg = "" + state.artDetails.sources.length + " sources, " + state.artDetails.labels.length + " warning labels"; 
        showFunc = function () {
          unsourcedPopup.port.emit('showDetails', state.artDetails);
        }
      } else {
        icon = data.url("unsourced.png");
        msg = "No information about article"
        showFunc = function () {
          unsourcedPopup.port.emit('showNoDetails', {'submit_url': submit_url});
        }
      };
    } else {
      icon = data.url("unsourced.png");
      msg = "checking page..."; 
      showFunc = null;
    }
  } else {
    // not tracking this page (url wasn't on our whitelist, or blank page, or whatever)
    if( /^https?:\/\/.*/i.test(tab.url) ) {

      icon = data.url("unsourced.png");
      msg = "Article not covered";
      showFunc = function () {
        unsourcedPopup.port.emit('showNoDetails', {'submit_url': submit_url});
      };
    } else {
      icon = data.url("unsourced.png");
      msg = "";
      showFunc = null;
    }
  } 
  if(showFunc) {
    view.panel = unsourcedPopup;
  } else {
    view.panel = null;  // no popup please...
  }

  view.content = '<img width="16" height="16" src="' + icon + '" />';
  view.tooltip = msg;

  //view.content = "" + details.sources.length + " sources, " + details.labels.length +" labels";

  unsourcedPopup.on('show', function() {
    if(showFunc) {
      showFunc();
    }
  });
}

tabs.on('activate', updateWidgetView);

installPageMod();

console.log("F.A.B.");
// open an article with known data
tabs.open("http://www.dailymail.co.uk/health/article-2199323/Why-fortified-bowl-soup-mothers-key-preventing-childhood-asthma.html");
