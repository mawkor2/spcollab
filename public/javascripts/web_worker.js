if (typeof Worker === 'undefined') {
  Worker = function(path) {
    function IWorker() {
      var __w = this;
      var messageq = [];
      __w.postMessage = function(m){messageq.push(m);};
      this.__bindBody = function(data) {
        var __win = { 
          postMessage : function(m) {
            if(__w.onmessage) {
              setTimeout(function(){ __w.onmessage({data: m});}, 1);
            }
          },
          importScripts : function(src)
          {
            var script = document.createElement("script");
            script.src = src ;
            script.setAttribute("type", "text/javascript");
            document.getElementsByTagName("head")[0].appendChild(script)
            return true;
          },
          _onmessage : null
        };
        with(__win){
          eval(data);
          if (onmessage) {
            _onmessage = onmessage;
            onmessage = null;
            __w.postMessage = function(m) {
              setTimeout(function() {__win._onmessage({data: m});}, 1);
            }
          }
          else {
            __w.postMessage = function() {
              for(var i=0,msg;msg=messageq[i];i++){
                __w.postMessage(msg);
              }
            }
          }
        }
      }
    }
    var iworker = new IWorker();
    var getHTTPObject = function() 
    {
      var xmlhttp;
      try 
      {
        xmlhttp = new XMLHttpRequest();
      }
      catch (e) 
      {
        try 
        {
          xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
        }
        catch (e) 
        {
          xmlhttp = false;
        }
      }
      return xmlhttp;
    }

    var http = getHTTPObject()
    http.open("GET", path, false)
    http.send(null);

    if (http.readyState == 4) 
    {
      var strResponse = http.responseText
      iworker.__bindBody(strResponse);
    };
    return iworker;
  };
};
