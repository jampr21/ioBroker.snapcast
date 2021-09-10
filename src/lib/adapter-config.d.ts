// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			host: string;
			port: string;
			media_path: string;
			tcp_socket_host: string;
			tcp_socket_port: string;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
