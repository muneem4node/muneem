const YAML = require('yamljs');
const fs = require('fs');
const path = require('path');
var url = require('url');
const HttpAnswer = require('./HttpAnswer');

function getFilePath(filepath){
    if (fs.existsSync(filepath)) {
        return filepath;
    }

    throw Error("Path for mapping files/folder should either be absolute or relative to project directory: " + filepath)
}

/**
 * Call `loadRoutesFrom` for each mapping file 
 * @param {*} router 
 * @param {string} filepath 
 * @param {*} handlers 
 * @param {string} profile 
 */
const mapRoutes = function(router,options,handlers){
    const profile = process.env.NODE_ENV;
    filepath = getFilePath(options.mappings);
    if(fs.lstatSync(filepath).isDirectory()){
        const files = fs.readdirSync(filepath);
        for(let index in files){
            const fPath = path.join(filepath,files[index]);
            if(!fs.lstatSync(fPath).isDirectory() && fPath.endsWith(".yaml")){
                const routes = readRoutesFromFile(fPath);
                routes && loadRoutesFrom(router,routes,handlers,profile,options);
            }
        }
    }else{
        const routes = readRoutesFromFile(filepath);
        routes && loadRoutesFrom(router,routes,handlers,profile,options);
    }
}

function readRoutesFromFile(filepath){
    try{
        //TODO : log total mappings
        return YAML.parseFile(filepath);
    }catch(e){
        //TODO: use logger
        console.log( filepath + " is an invalid Yaml file or have syntatx issues.");
        console.log( e);
    }
}

/**
 * Read routes mapping from given path and set router with appropriate actions
 * @param {*} router 
 * @param {string} filepath 
 * @param {*} handlers 
 * @param {string} profile 
 */
const loadRoutesFrom = function(router,routes,handlers,profile,options){
    
    for(let index=0;index<routes.length;index++){
        const route = routes[index].route;
        if(route.in && route.in.indexOf(profile) === -1){
            continue; //skip mapping for other environments
        }else{
            route.when = route.when || "GET";//set default
            const routeHandlers = extractHandlersFromRoute(route,handlers,options);


            router.on(route.when,route.uri, function(nativeRequest,nativeResponse,params){
                const ans = new HttpAnswer(nativeResponse);
                const req = buildRequestWrapper(nativeRequest,params,route);
                
                //operation on request stream

                for(let i=0; i<routeHandlers.reqHandlers.length;i++){
                    routeHandlers.reqHandlers[i].handle(req ,ans);
                    if(ans.answered())  return;
                }

                //need not to read the request body
                // if the method is HEAD or GET
                // if there is no main and post handler
                // if some prehandler has already sent the response
                // instead end the response

                nativeRequest.on('error', function(err) {
                    //logger.error(msg);
                });
                handleRequestPayloadStream(nativeRequest, req, ans, routeHandlers);

                nativeRequest.on('end', function() {
                    //TODO: do the conversion on demand
                    //nativeRequest.rawBody = Buffer.concat(body);
                    //nativeRequest.body = nativeRequest.rawBody.toString();

                    if(routeHandlers.reqDataStreamHandler && routeHandlers.reqDataStreamHandler.before){
                        routeHandlers.reqDataStreamHandler.after(req,ans);
                        if(ans.answered())  return;
                    }

                    //operation on request body
                    for(let i=0; i<routeHandlers.reqDataHandlers.length;i++){
                        routeHandlers.reqDataHandlers[i].handle(req ,ans);
                        if(ans.answered())  return;
                    }
                    
                    handlers.get(route.to).handle(req,ans);
                    if(ans.answered()) return;

                    //operation on respoonse
                    for(let i=0; i<routeHandlers.resHandlers.length;i++){
                        routeHandlers.resHandlers[i].handle(req,ans);
                        if(ans.answered()) return;
                    }

                    if(!ans.answered()){//To confirm if some naughty postHandler has already answered
                        if(ans.stream){
                            ans.stream.pipe(nativeResponse);
                        }else{
                            if(ans.data !== undefined){
                                if(typeof ans.data !== "string"){
                                    //TODO: report to logger
                                    console.log("response should be serialized to string for " + JSON.stringify(route,null,4));
                                }else{
                                    nativeResponse.write(ans.data, ans.encoding);	
                                }
                            }
                            nativeResponse.end();	
                        }
                    }

                })//request event handler end
            })//router ends
        }
    }
}

/**
 * If there is a stream handler attached to current route then call it on when request payload chunks are received.
 * If there is no stream handler and data handler then there is no need to read the request body
 * @param {*} nativeRequest 
 * @param {*} wrappedRequest 
 * @param {*} ans 
 * @param {*} routeHandlers 
 */
function handleRequestPayloadStream(nativeRequest, wrappedRequest, ans, routeHandlers){

    let contentLength = 0;
    if(routeHandlers.reqDataStreamHandler){
        if(routeHandlers.reqDataStreamHandler.before){
            routeHandlers.reqDataStreamHandler.before(wrappedRequest,ans);
            if(ans.answered()) nativeRequest.removeAllListeners();
        }

        nativeRequest.on('data', function(chunk) {
                routeHandlers.reqDataStreamHandler.handle(chunk);
                if(ans.answered()){
                    nativeRequest.removeAllListeners();
                    //nativeRequest.removeListener('data', dataListener)
                    //nativeRequest.removeListener('end', endListener)
                }  
        })
    }else if(routeHandlers.reqDataHandlers.length > 0){
        //User may want to take multiple decisions instead of just refusing the request and closing the connection
        nativeRequest.on('data', function(chunk) {
            if(contentLength < route.maxLength){
                contentLength += chunk.length;
                req.body += chunk;//TODO: ask user if he wants Buffer array
            }else{
                //TODO: eventEmitter.emit("exceedContentLength")
                handlers.get("__exceedContentLength").handle(wrappedRequest,ans);

            }
        })  
    }else{
        //Don't read the request body
    }
}

function buildRequestWrapper(request,params,route){
    var parsedURL = url.parse(request.url, true);
    return {
        url: parsedURL.pathname,
        query : parsedURL.query,
        params : params,
        nativeRequest : request,
        mapping: route,
        body: ''
    }
}

function extractHandlersFromRoute(route,handlers,options){
    const routeHandlers = {
        reqHandlers : [],
        reqDataStreamHandler: undefined,
        reqDataHandlers : [],
        resHandlers : []
    }

    //Prepare the list of handler need to be called before
    if(route.after){
        for(let i=0;i<route.after.length;i++){
            const handler = handlers.get(route.after[i]);
            if(!handler) throw Error("Unregistered handler " + router.after[i]);

            if((route.when === "GET" || route.when === "HEAD") 
                && (handler.type === "requestDataStream" || handler.type === "requestData") 
                && !options.alwaysReadRequestPayload){
                throw Error("Set alwaysReadRequestPayload if you want to read request body/payload for GET and HEAD methods");
            }

            if(handler.type === "requestDataStream"){
                if(routeHandlers.reqDataHandlers.length > 0){
                    throw Error("MappingError: Request Stream handler should be called before.");
                }else if(routeHandlers.reqDataStreamHandler){
                    throw Error("MappingError: There is only one request stream handler per mapping allowed.");
                }else{
                    routeHandlers.reqDataStreamHandler = handler;
                }
            }else if(handler.type === "requestData"){
                routeHandlers.reqDataHandlers.push(handler);
            }else/*   if(handler.type === "request") */{
                routeHandlers.reqHandlers.push(handler);
            }
        }
    }

    //Prepare the list of handler need to be called after
    if(route.then){
        for(let i=0;i<route.then.length;i++){
            const handler = handlers.get(route.then[i]);
            if(!handler) throw Error("Unregistered handler " + route.then[i]);
            else if(handler.type !== "response"){
                throw Error("Ah! wrong place for " + route.then[i] + ". Only response handlers are allowed here.");
            }
            routeHandlers.resHandlers.push(handler);
        }
    }

    return routeHandlers;
}

exports.mapRoutes = mapRoutes;