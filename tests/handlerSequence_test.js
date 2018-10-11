
//should not call handler further is answer stream is end
const RoutesManager = require("../src/routesManager");
const HandlersMap = require("../src/HandlersContainer");
//const Handler = require("../src/Handler");
const path = require("path");
const MockReq = require('mock-req');
const MockRes = require('mock-res');
const Muneem = require("../src/muneem")

describe ('Routes Manager', () => {

    it('should call handlers in defined order added by direct methods', (done) => {
        
        const muneem = Muneem({
            alwaysReadRequestPayload: true
        });

        let blocks = [];

        muneem.addHandler("auth", () => {blocks.push("auth")} ) ;
        muneem.addHandler("parallel", () => {
            setTimeout(() => {
                blocks.push("parallel");
                expect(blocks).toEqual([ 'auth', 'main', 'post', 'last', 'parallel' ]);
                done();
            });
        }) ;
        muneem.addHandler("main", async (asked,answer) => {
            blocks.push("main")
        } ) ;
        muneem.addHandler("post", () => {blocks.push("post")} );
        muneem.addHandler("last", () => {blocks.push("last")} ) ;

        const routesManager = muneem.routesManager;
        
        routesManager.addRoute({
            when : "POST",
            url: "/test",
            to: "main",
            after: ["auth", "parallel"],
            then: ["post", "last"]
        });

        var request  = new MockReq({
            method: "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(response.statusCode ).toEqual(200);
            expect(blocks).toEqual([ 'auth',  'main', 'post', 'last']);
        });
        routesManager.router.lookup(request,response);

    });


    it('should call handlers in defined order added by add method', (done) => {
        
        const muneem = Muneem({
            alwaysReadRequestPayload: true
        });

        let blocks = [];

        muneem.add( "Handler",  "auth", () => {blocks.push("auth")} ) ;
        muneem.add( "Handler", "parallel",  () => {
            setTimeout(() => {
                blocks.push("parallel");
                expect(blocks).toEqual([ 'auth', 'main', 'post', 'last', 'parallel' ]);
                done();
            });
        }) ;
        muneem.add( "Handler", "main",  async (asked,answer) => {
            blocks.push("main")
        } ) ;
        muneem.add( "Handler", "post",  () => {blocks.push("post")} );
        muneem.add( "Handler", "last",  () => {blocks.push("last")} ) ;

        const routesManager = muneem.routesManager;
        
        muneem.add ("route", {
            when : "POST",
            url: "/test",
            to: "main",
            after: ["auth", "parallel"],
            then: ["post", "last"]
        });

        var request  = new MockReq({
            method: "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(response.statusCode ).toEqual(200);
            expect(blocks).toEqual([ 'auth',  'main', 'post', 'last']);
        });
        routesManager.router.lookup(request,response);

    });


    it('should call handlers in defined order without adding handlers', (done) => {
        
        const muneem = Muneem({
            alwaysReadRequestPayload: true
        });

        let blocks = [];

        var auth = () => {blocks.push("auth")}  ;
        var parallel = () => {
            setTimeout(() => {
                blocks.push("parallel");
                expect(blocks).toEqual([ 'auth', 'main', 'post', 'last', 'parallel' ]);
                done();
            });
        } ;
        var main = async (asked,answer) => {
            blocks.push("main")
        }  ;
        var post = () => {blocks.push("post")} ;
        var last = () => {blocks.push("last")} ;

        const routesManager = muneem.routesManager;
        
        routesManager.addRoute({
            when : "POST",
            url: "/test",
            to: main,
            after: [ auth, parallel],
            then: [post, last]
        });

        var request  = new MockReq({
            method: "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(response.statusCode ).toEqual(200);
            expect(blocks).toEqual([ 'auth',  'main', 'post', 'last']);
        });
        routesManager.router.lookup(request,response);

    });

    it('should call handler in defined order with custom stream reader', (done) => {
        
        const muneem = Muneem({
            alwaysReadRequestPayload: true
        });

        let blocks = [];

        const streamHandler = async (asked,answer) => {
            await new Promise((resolve,reject) => {
                asked.stream.on("data", chunk => {
                    asked.body.push(chunk);
                })
                asked.stream.on("end", () => {
                    asked.body = Buffer.concat(asked.body); 
                    blocks.push("stream");
                    resolve(asked.body);
                })
            } );
        };

        muneem.addHandler("auth", () => {blocks.push("auth")} ) ;
        muneem.addHandler("stream",streamHandler) ;
        muneem.addHandler("main", (asked,answer) => {
            answer.write(asked.body);
            blocks.push("main")
        } ) ;
        muneem.addHandler("post", () => {blocks.push("post")} );
        muneem.addHandler("last", () => {blocks.push("last")} ) ;

        const routesManager = muneem.routesManager;
        
        routesManager.addRoute({
            when : "POST",
            url: "/test",
            to: "main",
            after: ["auth", "stream"],
            then: ["post", "last"]
        });

        var request  = new MockReq({
            method : "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(blocks).toEqual([ 'auth', 'stream', 'main', 'post', 'last']);
            expect(response._getString() ).toEqual("data sent in request");
            expect(response.statusCode ).toEqual(200);
            done();
        });
        routesManager.router.lookup(request,response);

        request.write("data sent in request");
        request.end();
    });

    it('should call pre/post handlers but not on main handler', (done) => {
        
        const muneem = Muneem();
        let blocks = [];

        muneem.addHandler("auth", () => {blocks.push("auth")} ) ;
        muneem.addHandler("parallel", () => {
            setTimeout(() => {

                blocks.push("parallel");
                expect(blocks).toEqual([ 
                    "Pre: before auth", 'auth' ,"Pre: after auth",
                    'Pre: before parallel', 'Pre: after parallel',
                    'main', 
                    'Post: before post' , 'post', 'Post: after post',
                    'Post: before last', 'last', 'Post: after last',
                    'parallel'
                ]);
                done();
            },0);
        }) ;
        muneem.addHandler("main", async (asked,answer) => {
            answer.write(await asked.readBody());
            blocks.push("main")
        } ) ;
        muneem.addHandler("post", () => {blocks.push("post")} );
        muneem.addHandler("last", () => {blocks.push("last")} ) ;

        const routesManager = muneem.routesManager;
        muneem.before("PreHandler", (asked, handlerName) => {
            blocks.push("Pre: before " + handlerName)
        });
        muneem.after("PreHandler", (asked, handlerName) => {
            blocks.push("Pre: after " + handlerName)
        });

        muneem.before("PostHandler", (asked, handlerName) => {
            blocks.push("Post: before " + handlerName)
        });
        muneem.after("PostHandler", (asked, handlerName) => {
            blocks.push("Post: after " + handlerName)
        });

        routesManager.addRoute({
            url: "/test",
            to: "main",
            when: ["POST"],
            after: ["auth", "parallel"],
            then: ["post", "last"]
        });

        var request  = new MockReq({
            method: "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(blocks).toEqual([ 
                "Pre: before auth", 'auth' ,"Pre: after auth",
                'Pre: before parallel', 'Pre: after parallel',
                'main', 
                'Post: before post' , 'post', 'Post: after post',
                'Post: before last', 'last', 'Post: after last'
            ]);
            expect(response._getString() ).toEqual("data sent in request");
            expect(response.statusCode ).toEqual(200);
        });
        routesManager.router.lookup(request,response);

        request.write("data sent in request");
        request.end();

    });

    it('should call pre/post handlers including main handler', (done) => {
        
        const muneem = Muneem();
        let blocks = [];

        muneem.addHandler("auth", () => {blocks.push("auth")} ) ;
        
        muneem.addHandler("main", async (asked,answer) => {
            answer.write(await asked.readBody());
            blocks.push("main")
        } ) ;
        muneem.addHandler("post", () => {blocks.push("post")} );
        muneem.addHandler("last", () => {blocks.push("last")} ) ;

        const routesManager = muneem.routesManager;
        muneem.before("each", (asked, handlerName) => {
            blocks.push("before " + handlerName)
        });
        muneem.after("each", (asked, handlerName) => {
            blocks.push("after " + handlerName)
        });

        routesManager.addRoute({
            url: "/test",
            to: "main",
            when: ["POST"],
            after: ["auth"],
            then: ["post", "last"]
        });

        var request  = new MockReq({
            method: "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(response._getString() ).toEqual("data sent in request");
            expect(response.statusCode ).toEqual(200);
            expect(blocks).toEqual([ 
                "before auth", 'auth' ,"after auth",
                'before main' ,'main', 'after main' ,
                'before post' , 'post', 'after post',
                'before last', 'last', 'after last'
            ]);
            done()
        });
        routesManager.router.lookup(request,response);

        request.write("data sent in request");
        request.end();

    });

    it('should skip rest handlers when response is already ended', (done) => {
        
        const muneem = Muneem();
        let blocks = [];

        muneem.addHandler("auth", () => {blocks.push("auth")} ) ;
        muneem.addHandler("parallel", () => {
            setTimeout(() => {

                blocks.push("parallel");
                expect(blocks).toEqual([ 
                     'auth' ,
                    'Main: before main', 'main', 'Main: after main',
                    //'post',
                    //'last',
                    'parallel'
                ]);
                done();
            },0);
        }) ;

        muneem.addHandler("main", async (asked,answer) => {
            answer.write(await asked.readBody());
            answer.end();
            blocks.push("main")
        } ) ;
        muneem.addHandler("post", () => {blocks.push("post")} );
        muneem.addHandler("last", () => {blocks.push("last")} ) ;

        const routesManager = muneem.routesManager;
        muneem.before("main", (asked, handlerName) => {
            blocks.push("Main: before " + handlerName)
        });
        muneem.after("main", (asked, handlerName) => {
            blocks.push("Main: after " + handlerName)
        });

        routesManager.addRoute({
            url: "/test",
            to: "main",
            when: ["POST"],
            after: ["auth", "parallel"],
            then: ["post", "last"]
        });

        var request  = new MockReq({
            method: "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(response._getString() ).toEqual("data sent in request");
            expect(response.statusCode ).toEqual(200);
            expect(blocks).toEqual([ 
                'auth' ,
               "Main: before main", 'main', 'Main: after main',
               //'post',
               //'last',
           ]);
        });
        routesManager.router.lookup(request,response);

        request.write("data sent in request");
        request.end();

    });

    it('should skip next N handlers when skip is called', (done) => {
        
        const muneem = Muneem();
        let blocks = [];

        muneem.addHandler("auth", () => {blocks.push("auth")} ) ;
        muneem.addHandler("parallel", () => {
            setTimeout(() => {

                blocks.push("parallel");
                expect(blocks).toEqual([ 
                     'auth' ,
                    'Main: before main', 'main', 'Main: after main',
                    //'post',
                    'last',
                    'parallel'
                ]);
                done();
            },0);
        }) ;

        muneem.addHandler("main", async (asked,answer) => {
            answer.write(await asked.readBody());
            answer.skip(1);
            blocks.push("main")
        } ) ;
        muneem.addHandler("post", () => {blocks.push("post")} );
        muneem.addHandler("last", () => {blocks.push("last")} ) ;

        const routesManager = muneem.routesManager;
        muneem.before("main", (asked, handlerName) => {
            blocks.push("Main: before " + handlerName)
        });
        muneem.after("main", (asked, handlerName) => {
            blocks.push("Main: after " + handlerName)
        });

        routesManager.addRoute({
            url: "/test",
            to: "main",
            when: ["POST"],
            after: ["auth", "parallel"],
            then: ["post", "last"]
        });

        var request  = new MockReq({
            method: "POST",
            url: '/test'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(response._getString() ).toEqual("data sent in request");
            expect(response.statusCode ).toEqual(200);
            expect(blocks).toEqual([ 
                'auth' ,
               "Main: before main", 'main', 'Main: after main',
               //'post',
               'last',
           ]);
        });
        routesManager.router.lookup(request,response);

        request.write("data sent in request");
        request.end();

    });

    it('should get/set headers should be available to next handler', (done) => {
        
        const muneem = Muneem();
        muneem.addHandler("main", (asked,answer) => {
            answer.type("plain/text");
            answer.setHeader("removable","plain/text");
        } ) ;
        muneem.addHandler("parser", (asked,answer) => {
            var type = answer.getHeader("content-type");
            if(type === "application/json"){
                answer.write("{'hello':'world'");
            }else{
                answer.write("hello world");
            }
            answer.removeHeader("removable");
        } ) ;

        const routesManager = muneem.routesManager;
        
        routesManager.addRoute({
            url: "/test/:param",
            to: "main",
            then: "parser"
        });

        var request  = new MockReq({
            url: '/test/val'
        });

        var response = new MockRes();

        response.on('finish', function() {
            expect(response._getString()).toEqual('hello world');
            expect(response._headers).toEqual({
                "content-type": 'plain/text',
                "content-length": 11
            });
            expect(response.statusCode ).toEqual(200);
            done();
        });
        routesManager.router.lookup(request,response);

        request._read("data sent in request");

    });
});
