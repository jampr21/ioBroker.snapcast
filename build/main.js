"use strict";
/*
 * Created with @iobroker/create-adapter v1.31.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function () { return m[k]; } });
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));

// Load your modules here, e.g.:
// import * as fs from "fs";

const WebSocket = require("ws");

class Snapcast extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "snapcast",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info("config option1: " + this.config.host);
        this.log.info("config option2: " + this.config.port);
        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        await this.setObjectNotExistsAsync("rasJson", {
            type: "state",
            common: {
                name: "rawJson",
                type: "rawJson",
                role: "string",
                read: true,
                write: true,
            },
            native: {},
        });

        const ServerGetRPCVersion_request = {
            'id': 0,
            'jsonrpc': '2.0',
            'method': 'Server.GetRPCVersion'
        };

        const ServerGetStatus_request = { "id": 1, "jsonrpc": "2.0", "method": "Server.GetStatus" };


        // Reset the connection indicator during startup
        //thanks to UncleSam, stolen from loxone adapter
        this.setState("info.connection", false, true);

        //open websocket to snapcast server host:port
        this.client = new WebSocket("ws://" + this.config.host + ":" + this.config.port + "/jsonrpc", {
            origin: "http://" + this.config.host + ":" + this.config.port + "/jsonrpc"
        });

        //catch error during establishing connection
        this.client.on('error', (error) => {
            this.log.error("Socket connection failed. Reason: " + error);
            this.setState("info.connection", false, true);
        })

        this.client.on("open", () => {
            this.client.send(JSON.stringify(++ServerGetRPCVersion_request.id && ServerGetRPCVersion_request));
            this.log.info("connection opened");
            this.setState("info.connection", true, true);

            //get current server status (includes all clients, groups and streams)
            this.client.send(JSON.stringify(++ServerGetStatus_request.id && ServerGetStatus_request));
        });

        // alles, was reinkommt
        this.client.on('message', (data) => {

            let jsonData = JSON.parse(data);

            //check if it is a response of an event, that was requested
            if (typeof jsonData.id !== "undefined") {
                //response
                switch (jsonData.id) {
                    //Server.GetStatus
                    case 1: {
                        this.log.info("id" + JSON.parse(data).id + "; message " + data);
                        break;
                    }
                    default: {
                        this.storeServerGetStatus(jsonData);
                        break;
                    }
                }
            } else {
                //notification
                switch (jsonData.method) {
                    case "Client.OnVolumeChanged": {
                        this.log.info("method " + jsonData.method + " -- " + data);
                        break;
                    }
                    default: {
                        this.log.info("id" + JSON.parse(data).id + "; message " + data);
                        break;
                    }
                }

            }

        });






        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        //FSR        this.subscribeStates("testVariable");
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates("lights.*");
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates("*");
        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        //fsr        await this.setStateAsync("testVariable", true);
        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        //fsr        await this.setStateAsync("testVariable", { val: true, ack: true });
        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        //fsr        await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });
        // examples for the checkPassword/checkGroup functions
        /*        let result = await this.checkPasswordAsync("admin", "iobroker");
                this.log.info("check user admin pw iobroker: " + result);
                result = await this.checkGroupAsync("admin", "admin");
                this.log.info("check group user admin group admin: " + result);
        */
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            callback();
        }
        catch (e) {
            callback();
        }
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    // 	if (obj) {
    // 		// The object was changed
    // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    // 	} else {
    // 		// The object was deleted
    // 		this.log.info(`object ${id} deleted`);
    // 	}
    // }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }



    async storeServerGetStatus(jsonData) {
        this.log.info("id " + jsonData.id + "stream# " + jsonData.result.server.streams[0].id);

        let baseFolder = "ServerStatus";
        let streamsFolder = baseFolder + ".Streams";
        let serverFolder = baseFolder + '.Server';       
        let groupsFolder = baseFolder + '.Groups';     

        let server = jsonData.result.server;

        //streams 
        for (let i in server.streams) {

            let stream = server.streams[i];
            let folderState =   streamsFolder + '.' + stream.id;

            await this.setObjectNotExistsAsync(folderState, {
                type: "state",
                common: {
                    name: "Stream " + i,
                    type: "string",
                    role: "state",
                    read: true,
                    write: true,
                },
                native: {},
            });

            await this.setStateAsync(folderState, { val: stream.uri.raw, ack: true });

            let statusState = folderState + ".status";
            await this.setObjectNotExistsAsync(statusState, {
                type: "state",
                common: {
                    name: "Status",
                    type: "string",
                    role: "state",
                    read: true,
                    write: true,
                },
                native: {},
            });
            await this.setStateAsync(statusState, { val: stream.status, ack: true });
        }// streams loop end

        //server and snapserver

        // server.host.arch
		let serverArchState = serverFolder +'.host.arch';
        await this.setObjectNotExistsAsync(serverArchState, {
            type: "state",
            common: {
                name: "host.arch",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverArchState, { val: server.server.host.arch, ack: true });

		// server.host.ip
        let serverIpState = serverFolder +'.host.ip';
        await this.setObjectNotExistsAsync(serverIpState, {
            type: "state",
            common: {
                name: "host.ip",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverIpState, { val: server.server.host.ip, ack: true });

		// server.host.mac 
        let serverMacState = serverFolder +'.host.mac';
        await this.setObjectNotExistsAsync(serverMacState, {
            type: "state",
            common: {
                name: "host.mac",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverMacState, { val: server.server.host.mac, ack: true });

		// server.host.name
        let serverClientnameState = serverFolder +'.host.name'; 
        await this.setObjectNotExistsAsync(serverClientnameState, {
            type: "state",
            common: {
                name: "host.name",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverClientnameState, { val: server.server.host.name, ack: true });
        
		// server.host.os
        let serverOsState = serverFolder +'.host.os'; 
        await this.setObjectNotExistsAsync(serverOsState, {
            type: "state",
            common: {
                name: "host.os",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverOsState, { val: server.server.host.os, ack: true });
        
		// snapserver.controlProtocolVersion
        let serverSnapserverControlProtocolVersionState = serverFolder +'.snapserver.controlProtocolVersion'; 
        await this.setObjectNotExistsAsync(serverSnapserverControlProtocolVersionState, {
            type: "state",
            common: {
                name: "snapserver.controlProtocolVersion",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverSnapserverControlProtocolVersionState, { val: server.server.snapserver.controlProtocolVersion, ack: true });

		// snapserver.name
        let serverSnapserverNameState = serverFolder +'.snapserver.name'; 
        await this.setObjectNotExistsAsync(serverSnapserverNameState, {
            type: "state",
            common: {
                name: "snapserver.name",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverSnapserverNameState, { val: server.server.snapserver.name, ack: true });

		// snapserver.protocolVersion
        let serverSnapserverProtocolVersionState = serverFolder +'.snapserver.protocolVersion'; 
        await this.setObjectNotExistsAsync(serverSnapserverProtocolVersionState, {
            type: "state",
            common: {
                name: "snapserver.protocolVersion",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverSnapserverProtocolVersionState, { val: server.server.snapserver.protocolVersion, ack: true });

		// snapserver.version
        let serverSnapserverVersionState = serverFolder +'.snapserver.version'; 
        await this.setObjectNotExistsAsync(serverSnapserverVersionState, {
            type: "state",
            common: {
                name: "snapserver.version",
                type: "string",
                role: "state",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setStateAsync(serverSnapserverVersionState, { val: server.server.snapserver.version, ack: true });

        
        for (let i in server.groups) { 
            let group = server.groups[i];
            let groupState = groupsFolder + '.Group' + i;

            // groups[i].id
            let groupIdState = groupState +'.groupid'; 
            await this.setObjectNotExistsAsync(groupIdState, {
                type: "state",
                common: {
                    name: "group.id",
                    type: "string",
                    role: "state",
                    read: true,
                    write: true,
                },
                native: {},
            });
            await this.setStateAsync(groupIdState, { val: group.id, ack: true });
            
            // groups[i].muted
            let groupMutedState = groupState +'.muted'; 
            await this.setObjectNotExistsAsync(groupMutedState, {
                type: "state",
                common: {
                    name: "groups[i].muted",
                    type: "boolean",
                    role: "state",
                    read: true,
                    write: true,
                },
                native: {},
            });
            await this.setStateAsync(groupMutedState, { val: group.muted, ack: true });

            // groups[i].name
            let groupNameState = groupState +'.name'; 
            await this.setObjectNotExistsAsync(groupNameState, {
                type: "state",
                common: {
                    name: "groups[i].name",
                    type: "string",
                    role: "state",
                    read: true,
                    write: true,
                },
                native: {},
            });
            await this.setStateAsync(groupNameState, { val: group.name, ack: true });

            // groups[i].stream_id
            let groupStreamIdState = groupState +'.stream_id'; 
            await this.setObjectNotExistsAsync(groupStreamIdState, {
                type: "state",
                common: {
                    name: "groups[i].stream_id",
                    type: "string",
                    role: "state",
                    read: true,
                    write: true,
                },
                native: {},
            });
            await this.setStateAsync(groupStreamIdState, { val: group.stream_id, ack: true });
            
            for (let j in group.clients) {                 
                let client = server.groups[i].clients[j];        
                let clientState = groupState +'.Client' + j;
                // groups[i].clients[j].Client
                await this.setObjectNotExistsAsync(clientState, {
                    type: "state",
                    common: {
                        name: "Client " + j,
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                //await this.setStateAsync(groupStreamIdState, { val: group.stream_id, ack: true });
                
                // groups[i].clients[j].Client.clientid
                let clientIdState = clientState +'.clientid';
                await this.setObjectNotExistsAsync(clientIdState, {
                    type: "state",
                    common: {
                        name: "client.clientid",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientIdState, { val: client.clientid, ack: true });

                // groups[i].clients[j].Client.connected
                let clientConnectedState = clientState +'.connected';
                await this.setObjectNotExistsAsync(clientConnectedState, {
                    type: "state",
                    common: {
                        name: "client.connected",
                        type: "boolean",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientConnectedState, { val: client.connected, ack: true });

                // groups[i].clients[j].Client.client_count_nbr
                let clientCountNumberState = clientState +'.client_count_nbr';
                await this.setObjectNotExistsAsync(clientCountNumberState, {
                    type: "state",
                    common: {
                        name: "client.client_count_nbr",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientCountNumberState, { val: client.client_count_nbr, ack: true });
                

                //client host config

                let host = client.host;
                let clientHostState = clientState +'.host';

                // groups[i].clients[j].Client.host.arch
                let clientHostArchState = clientHostState +'.arch';
                await this.setObjectNotExistsAsync(clientHostArchState, {
                    type: "state",
                    common: {
                        name: "client.host.arch",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientHostArchState, { val: host.arch, ack: true });

                // groups[i].clients[j].Client.host.ip
                let clientHostIpState = clientHostState +'.ip';
                await this.setObjectNotExistsAsync(clientHostIpState, {
                    type: "state",
                    common: {
                        name: "client.host.ip",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientHostIpState, { val: host.ip, ack: true });

                // groups[i].clients[j].Client.host.ip
                let clientHostMacState = clientHostState +'.mac';
                await this.setObjectNotExistsAsync(clientHostMacState, {
                    type: "state",
                    common: {
                        name: "client.host.mac",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientHostMacState, { val: host.mac, ack: true });

                // groups[i].clients[j].Client.host.ip
                let clientHostNameState = clientHostState +'.name';
                await this.setObjectNotExistsAsync(clientHostNameState, {
                    type: "state",
                    common: {
                        name: "client.host.name",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientHostNameState, { val: host.name, ack: true });

                // groups[i].clients[j].Client.host.os
                let clientHostOsState = clientHostState +'.os';
                await this.setObjectNotExistsAsync(clientHostOsState, {
                    type: "state",
                    common: {
                        name: "client.host.os",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientHostOsState, { val: host.os, ack: true });


                //client last seen

                let lastSeen = client.lastSeen;
                let clientLastSeenState = clientState +'.lastSeen';

                // groups[i].clients[j].Client.lastSeen.sec
                let clientLastSeenSecState = clientLastSeenState +'.sec';
                await this.setObjectNotExistsAsync(clientLastSeenSecState, {
                    type: "state",
                    common: {
                        name: "client.lastSeen.sec",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientLastSeenSecState, { val: lastSeen.sec, ack: true });

                // groups[i].clients[j].Client.lastSeen.usec
                let clientLastSeenUsecState = clientLastSeenState +'.usec';
                await this.setObjectNotExistsAsync(clientLastSeenUsecState, {
                    type: "state",
                    common: {
                        name: "client.lastSeen.usec",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientLastSeenUsecState, { val: lastSeen.usec, ack: true });

                //client snapclient

                let snapclient = client.snapclient;
                let clientSnapclientState = clientState +'.snapclient';

                // groups[i].clients[j].Client.snapclient.name
                let clientSnapclientNameState = clientSnapclientState +'.name';
                await this.setObjectNotExistsAsync(clientSnapclientNameState, {
                    type: "state",
                    common: {
                        name: "client.snapclient.name",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientSnapclientNameState, { val: snapclient.name, ack: true });

                // groups[i].clients[j].Client.snapclient.name
                let clientSnapclientProtocolVersionState = clientSnapclientState +'.protocolVersion';
                await this.setObjectNotExistsAsync(clientSnapclientProtocolVersionState, {
                    type: "state",
                    common: {
                        name: "client.snapclient.protocolVersion",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientSnapclientProtocolVersionState, { val: snapclient.protocolVersion, ack: true });
                
                // groups[i].clients[j].Client.snapclient.version
                let clientSnapclientVersionState = clientSnapclientState +'.version';
                await this.setObjectNotExistsAsync(clientSnapclientVersionState, {
                    type: "state",
                    common: {
                        name: "client.snapclient.version",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientSnapclientVersionState, { val: snapclient.version, ack: true });
                
                //client config

                let config = client.config;
                let clientConfigState = clientState +'.config';

                // groups[i].clients[j].Client.config.instance
                let clientConfigInstanceState = clientConfigState +'.instance';
                await this.setObjectNotExistsAsync(clientConfigInstanceState, {
                    type: "state",
                    common: {
                        name: "client.config.instance",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientConfigInstanceState, { val: config.instance, ack: true });
                
                // groups[i].clients[j].Client.config.latency
                let clientConfigLatencyState = clientConfigState +'.latency';
                await this.setObjectNotExistsAsync(clientConfigLatencyState, {
                    type: "state",
                    common: {
                        name: "client.config.latency",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientConfigLatencyState, { val: config.latency, ack: true });

                // groups[i].clients[j].Client.config.name
                let clientConfigNameState = clientConfigState +'.name';
                await this.setObjectNotExistsAsync(clientConfigNameState, {
                    type: "state",
                    common: {
                        name: "client.config.name",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientConfigNameState, { val: config.name, ack: true });

                let volume = config.volume;
                let clientConfigVolumeState = clientConfigState +'.volume';
                
                // groups[i].clients[j].Client.config.volume.muted
                let clientConfigVolumeMutedState = clientConfigVolumeState +'.muted';
                await this.setObjectNotExistsAsync(clientConfigVolumeMutedState, {
                    type: "state",
                    common: {
                        name: "client.config.volume.muted",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientConfigVolumeMutedState, { val: volume.muted, ack: true });

                // groups[i].clients[j].Client.config.volume.percent
                let clientConfigVolumePercentState = clientConfigVolumeState +'.percent';
                await this.setObjectNotExistsAsync(clientConfigVolumePercentState, {
                    type: "state",
                    common: {
                        name: "client.config.volume.percent",
                        type: "string",
                        role: "state",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
                await this.setStateAsync(clientConfigVolumePercentState, { val: volume.percent, ack: true });
 
            }//end group.clients loop
        }//end groups loop
        
    }// end storeServerGetStatus function
}



if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new Snapcast(options);
}
else {
    // otherwise start the instance directly
    (() => new Snapcast())();
}
