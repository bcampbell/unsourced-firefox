

Ashe.addModifiers({
    sourcelink: function(src) {
      if(src.title) { 
        return '<a target="_blank" href="' + src.url + '">' + src.title + '</a>';
      } else {
        var loc = parseUri(src.url);
        var title = {'pr':"Press release", 'paper': "Paper", 'other':"Other link"}[src.kind] || 'Source';
        return '<a target="_blank" href="' + src.url + '">' + title + '</a> (' + loc.host + ')';
      }
    }
    // , oneMoreModifier: function(str) { ... }
});



function display(tmplName,params)
{
    var template = document.getElementById(tmplName).innerHTML;
    var parsed = Ashe.parse(template, params);
    document.getElementById('content').innerHTML = parsed;
}

// helper for wiring up
function seleach(csssel,f) {
    var matches = document.querySelectorAll(csssel);
      for (var i = 0; i < matches.length; ++i) {
          f(matches[i]);
      }
}


/* firefox specifics */


function bind(state,options) {
//  console.log("popup.js: bind()", JSON.stringify(state,null," "));

  if( state === undefined ||state === null ) {
    display('popup-inactive-tmpl', {});
  } else {

    // TODO: HACK HACK HACK FIX FIX FIX
    // in firefox version, content page can't access functions on the state,
    // so we fudge it by re-adding them here!
    state.getSubmitURL = function() {
      var submit_url = options.search_server + '/addarticle?url=' + encodeURIComponent(this.url);
      return submit_url;
    };
    // some helpers for use in popup.html template (ashe can only do boolean if statements)
    state.isLookupNone = function() { return this.lookupState == 'none'; };
    state.isLookupReady = function() { return this.lookupState == 'ready'; };
    state.isLookupPending = function() { return this.lookupState == 'pending'; };
    state.isLookupError = function() { return this.lookupState == 'error'; };

    state.isDebugSet = function() { return options.debug; };
    state.getDebugTxt = function() { return JSON.stringify(this,null," "); };

    state.wasArticleFound = function() { return this.lookupState == 'ready' && this.lookupResults.status=='found'; };

    state.isSourcingRequired = function() {
      if( this.wasArticleFound() ) {
        return this.lookupResults.needs_sourcing;
      }
      
      if( this.pageDetails && !this.pageDetails.isDefinitelyNotArticle && this.pageDetails.indicatorsFound ) {
        return true;
      }
      return false;
    };


        display('popup-details-tmpl', state);

        // wire up any other javascript here (eg buttons)
        // (chrome extensions don't support any javascript in the html file,
        // so it's got to be done here
        seleach('.start-manual-lookup', function(button) {
            button.onclick = function() {
              self.port.emit("startManualLookup");
              return false;
            };
        });

        
        var labels = [{"icon_url": "http://localhost:8888/static/label-m/warn_churn.png", "prettyname": "Churnalism", "description": "This article is basically just a press release, copied and pasted.", "id": "churn"}, {"icon_url": "http://localhost:8888/static/label-m/warn_badheadline.png", "prettyname": "Misleading headline", "description": "Massively misleading headline", "id": "bad_headline"}, {"icon_url": "http://localhost:8888/static/label-m/warn_twisteddata.png", "prettyname": "Misrepresented research", "description": "This article misrepresents the research/statistics on which it claims to be based", "id": "misrep"}, {"icon_url": "http://localhost:8888/static/label-m/warn_generic.png", "prettyname": "Bogus research", "description": "Claims in this article are based on bogus research", "id": "bogus_data"}];
        seleach('.add-warning', function(button) {
            button.onclick = function() {
              //self.port.emit("showstartManualLookup");
              var template = document.getElementById('popup-warning-picker-tmpl').innerHTML;
              var parsed = Ashe.parse(template, {'labels':labels});
              document.getElementById('content').innerHTML = parsed;

              seleach('.label', function(but) {
                but.onclick = function() {
                  var label_id = but.dataset.labelid;
                  self.port.emit("addLabel",label_id);
                };
              });
              return false;
            };
        });
  }
}



self.port.on("bind", bind);

// TODO: start off in a better state... (haven't got options here)
//bind(null);

