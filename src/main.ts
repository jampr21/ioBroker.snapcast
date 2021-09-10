/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";

// Load your modules here, e.g.:
import * as fs from "fs";
import * as net from "net";
import * as ns_path from "path";

import connection from "ws";


class Snapcast extends utils.Adapter {

	baseUrl: string;
	server: Server;
	msg_id: number;
	status_req_id: number;
	connection!: connection;
	mplayer: any;
	tcp_port: number;
	tcp_host: string;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "snapcast",
		});

		this.server = new Server();
		//this.baseUrl = "ws://" + this.config.host + ":" + this.config.port +"/jsonrpc";
		this.baseUrl = "ws://";
		this.msg_id = 0;
		this.status_req_id = -1;
		this.tcp_host = "";
		this.tcp_port = 0;


		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		// eslint-disable-next-line @typescript-eslint/indent
        this.log.info("config host: " + this.config.host);
		this.log.info("config port: " + this.config.port);

		this.tcp_host = this.config.tcp_socket_host;
		this.tcp_port = Number(this.config.tcp_socket_port);

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
		await this.setObjectNotExistsAsync("rawJson", {
			type: "state",
			common: {
				name: "rawJson",
				type: "string",
				role: "string",
				read: true,
				write: true,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync("Remote", {
			type: "state",
			common: {
				name: "send values",
				type: "string",
				role: "state",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync("Remote.id", {
			type: "state",
			common: {
				name: "id",
				type: "string",
				role: "state",
				read: true,
				write: true,
			},
			native: {},
		});

		const ServerGetRPCVersion_request = {
			"id": 0,
			"jsonrpc": "2.0",
			"method": "Server.GetRPCVersion"
		};


		await this.setObjectNotExistsAsync("currentPath", {
			type: "state",
			common: {
				name: "Path",
				type: "string",
				role: "string",
				read: true,
				write: true,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync("currentPathList", {
			type: "state",
			common: {
				name: "Path Content",
				type: "string",
				role: "string",
				read: true,
				write: true,
			},
			native: {},
		});

		const ServerGetStatus_request = { "id": 1, "jsonrpc": "2.0", "method": "Server.GetStatus" };

		await this.setStateAsync("currentPathList", { val: JSON.stringify(this.getFolders(this.config.media_path)), ack: true });
		await this.setStateAsync("currentPath", { val: this.config.media_path, ack: true });

		// Reset the connection indicator during startup
		//thanks to UncleSam, stolen from loxone adapter
		this.setState("info.connection", false, true);

		//open websocket to snapcast server host:port
		this.connection = new connection("ws://" + this.config.host + ":" + this.config.port + "/jsonrpc");

		//catch error during establishing connection
		this.connection.on("error", (error) => {
			this.log.error("Socket connection failed. Reason: " + error);
			this.setState("info.connection", false, true);
		});

		this.connection.on("open", () => {
			this.connection.send(JSON.stringify(++ServerGetRPCVersion_request.id && ServerGetRPCVersion_request));
			this.log.info("connection opened");
			this.setState("info.connection", true, true);

			//get current server status (includes all clients, groups and streams)
			this.connection.send(JSON.stringify(++ServerGetStatus_request.id && ServerGetStatus_request));
		});

		// alles, was reinkommt
		this.connection.on("message", (data: string) => {

			const jsonData = JSON.parse(data);

			//check if it is a response of an event, that was requested
			const is_response: boolean = (jsonData.id != undefined);

			this.log.info("Received " + (is_response ? "response" : "notification") + ", json: " + data)

			if (is_response) {
				//response
				switch (jsonData.id) {
					//Server.GetStatus
					case 1: {
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
						break;
					}
					case "Client.OnLatencyChanged":
					case "Client.OnNameChanged":
					case "Client.OnConnect":
					case "Client.OnDisconnect":
					case "Group.OnMute":
					case "Group.OnStreamChanged":
					case "Stream.OnUpdate":
					case "Server.OnUpdate":
					default: {
						break;
					}
				}
			}
		});

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		this.subscribeStates("currentPath");
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

	private getFolders(path:string): any {
		const result = [];
		let files: string[] = [];

		if (ns_path.extname(path).substr(1).localeCompare("mp3")){

			try{
				files = fs.readdirSync(path);
			} catch(err){
				this.log.error("no such file or directory: "+ path);
			}
			// create directory/file list
			for (let i = 0; i < files.length; i++) {
				const filePath = path + "/" + files[i];
				if (fs.statSync(filePath).isDirectory()) {
					result.push({"path" : path, "filename": files[i],"type" : "directory"});
				}else{
					result.push({"path" : path, "filename": files[i], "type" : ns_path.extname(files[i]).substr(1)});
				}
			}
		}else{

			//play single file
			this.log.info(`play ${path}`);
			//https://nodejs.org/docs/v8.1.4/api/child_process.html#child_process_child_process_exec_command_options_callback

			/* eslint-disable */
			let lame= require("@suldashi/lame");

			let client = new net.Socket();

			client.connect(this.tcp_port,   this.tcp_host   );

			fs.createReadStream(path)
				.pipe(new lame.Decoder)
				.pipe(client)
				.close;

			result.push({"path" : path, "filename": "", "type" : ns_path.extname(path).substr(1)});

		}

		return result;
	}

	//find "$(pwd)" -type f -name "*.mp3" |sort -n | mplayer -novideo -channels 2 -srate 48000 -af format=s16le -ao pcm:file=/opt/iobroker/snapfifo_iobroker -playlist /dev/fd/3 3<&0 0</dev/tty

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
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
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			let value =  `${state.val}`;

			if (value.indexOf(this.config.media_path) == -1){
				value = this.config.media_path;
				this.setState("currentPath", { val: value, ack: true });
			}
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			this.setState("currentPathList", { val: JSON.stringify(this.getFolders(value)), ack: true });
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	// private onMessage(obj: ioBroker.Message): void {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

	async storeServerGetStatus(jsonData:any): Promise<void> {


		await this.setStateAsync("rawJson", { val: JSON.stringify(jsonData), ack: true });

		const baseFolder = "ServerStatus";
		const streamsFolder = baseFolder + ".Streams";
		const serverFolder = baseFolder + ".Server";
		const groupsFolder = baseFolder + ".Groups";

		const server = jsonData.result.server;

		//streams
		for (const i in server.streams) {

			const stream = server.streams[i];
			const folderState =   streamsFolder + "." + stream.id;

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

			const statusState = folderState + ".status";
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
		const serverArchState = serverFolder +".host.arch";
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
		const serverIpState = serverFolder +".host.ip";
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
		const serverMacState = serverFolder +".host.mac";
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
		const serverClientnameState = serverFolder +".host.name";
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
		const serverOsState = serverFolder +".host.os";
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
		const serverSnapserverControlProtocolVersionState = serverFolder +".snapserver.controlProtocolVersion";
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
		const serverSnapserverNameState = serverFolder +".snapserver.name";
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
		const serverSnapserverProtocolVersionState = serverFolder +".snapserver.protocolVersion";
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
		const serverSnapserverVersionState = serverFolder +".snapserver.version";
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


		for (const i in server.groups) {
			const group = server.groups[i];
			const groupState = groupsFolder + ".Group" + i;

			// groups[i].id
			const groupIdState = groupState +".groupid";
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
			const groupMutedState = groupState +".muted";
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
			const groupNameState = groupState +".name";
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
			const groupStreamIdState = groupState +".stream_id";
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

			for (const j in group.clients) {
				const client = server.groups[i].clients[j];
				const clientState = groupState +".Client" + j;
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
				const clientIdState = clientState +".clientid";
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
				const clientConnectedState = clientState +".connected";
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
				const clientCountNumberState = clientState +".client_count_nbr";
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

				const host = client.host;
				const clientHostState = clientState +".host";

				// groups[i].clients[j].Client.host.arch
				const clientHostArchState = clientHostState +".arch";
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
				const clientHostIpState = clientHostState +".ip";
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
				const clientHostMacState = clientHostState +".mac";
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
				const clientHostNameState = clientHostState +".name";
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
				const clientHostOsState = clientHostState +".os";
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

				const lastSeen = client.lastSeen;
				const clientLastSeenState = clientState +".lastSeen";

				// groups[i].clients[j].Client.lastSeen.sec
				const clientLastSeenSecState = clientLastSeenState +".sec";
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
				const clientLastSeenUsecState = clientLastSeenState +".usec";
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

				const snapclient = client.snapclient;
				const clientSnapclientState = clientState +".snapclient";

				// groups[i].clients[j].Client.snapclient.name
				const clientSnapclientNameState = clientSnapclientState +".name";
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
				const clientSnapclientProtocolVersionState = clientSnapclientState +".protocolVersion";
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
				const clientSnapclientVersionState = clientSnapclientState +".version";
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

				const config = client.config;
				const clientConfigState = clientState +".config";

				// groups[i].clients[j].Client.config.instance
				const clientConfigInstanceState = clientConfigState +".instance";
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
				const clientConfigLatencyState = clientConfigState +".latency";
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
				const clientConfigNameState = clientConfigState +".name";
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

				const volume = config.volume;
				const clientConfigVolumeState = clientConfigState +".volume";

				// groups[i].clients[j].Client.config.volume.muted
				const clientConfigVolumeMutedState = clientConfigVolumeState +".muted";
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
				const clientConfigVolumePercentState = clientConfigVolumeState +".percent";
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



class Host {
	constructor(json: any) {
		this.fromJson(json);
	}

	fromJson(json: any):void {
		this.arch = json.arch;
		this.ip = json.ip;
		this.mac = json.mac;
		this.name = json.name;
		this.os = json.os;
	}

	arch = "";
	ip = "";
	mac = "";
	name = "";
	os = "";
}


class Client {
	constructor(json: any) {
		this.fromJson(json);
	}

	fromJson(json: any):void {
		this.id = json.id;
		this.host = new Host(json.host);
		const jsnapclient = json.snapclient;
		this.snapclient = { name: jsnapclient.name, protocolVersion: jsnapclient.protocolVersion, version: jsnapclient.version }
		const jconfig = json.config;
		this.config = { instance: jconfig.instance, latency: jconfig.latency, name: jconfig.name, volume: { muted: jconfig.volume.muted, percent: jconfig.volume.percent } }
		this.lastSeen = { sec: json.lastSeen.sec, usec: json.lastSeen.usec }
		this.connected = Boolean(json.connected);
	}

	id = "";
	host!: Host;
	snapclient!: {
		name: string;
		protocolVersion: number;
		version: string;
	}
	config!: {
		instance: number;
		latency: number;
		name: string;
		volume: {
			muted: boolean;
			percent: number;
		}
	};
	lastSeen!: {
		sec: number;
		usec: number;
	};
	connected = false;
}


class Group {
	constructor(json: any) {
		this.fromJson(json);
	}

	fromJson(json: any):void {
		this.name = json.name;
		this.id = json.id;
		this.stream_id = json.stream_id;
		this.muted = Boolean(json.muted);
		for (const client of json.clients)
			this.clients.push(new Client(client));
	}

	name = "";
	id = "";
	stream_id = "";
	muted = false;
	clients: Client[] = [];

	getClient(id: string): Client | null {
		for (const client of this.clients) {
			if (client.id == id)
				return client;
		}
		return null;
	}
}


class Stream {
	constructor(json: any) {
		this.fromJson(json);
	}

	fromJson(json: any):void {
		this.id = json.id;
		this.status = json.status;
		const juri = json.uri;
		this.uri = { raw: juri.raw, scheme: juri.scheme, host: juri.host, path: juri.path, fragment: juri.fragment, query: juri.query }
	}

	id = "";
	status = "";
	uri!: {
		raw: string;
		scheme: string;
		host: string;
		path: string;
		fragment: string;
		query: string;
	}
}


class Server {
	constructor(json?: any) {
		if (json)
			this.fromJson(json);
	}

	fromJson(json: any):void {
		this.groups = []
		for (const jgroup of json.groups)
			this.groups.push(new Group(jgroup));
		const jsnapserver: any = json.server.snapserver;
		this.server = { host: new Host(json.server.host), snapserver: { controlProtocolVersion: jsnapserver.controlProtocolVersion, name: jsnapserver.name, protocolVersion: jsnapserver.protocolVersion, version: jsnapserver.version } };
		this.streams = []
		for (const jstream of json.streams) {
			this.streams.push(new Stream(jstream));
		}
	}

	groups: Group[] = [];
	server!: {
		host: Host;
		snapserver: {
			controlProtocolVersion: number;
			name: string;
			protocolVersion: number;
			version: string;
		}
	};
	streams: Stream[] = [];

	getClient(id: string): Client | null {
		for (const group of this.groups) {
			const client = group.getClient(id);
			if (client)
				return client;
		}
		return null;
	}

	getGroup(id: string): Group | null {
		for (const group of this.groups) {
			if (group.id == id)
				return group;
		}
		return null;
	}

	getStream(id: string): Stream | null {
		for (const stream of this.streams) {
			if (stream.id == id)
				return stream;
		}
		return null;
	}
}


if (module.parent) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Snapcast(options);
} else {
	// otherwise start the instance directly
	(() => new Snapcast())();
}
