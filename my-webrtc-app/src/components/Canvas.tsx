import * as React from "react";
import { ObjectFlags } from "typescript";
import * as appEvents from "../AppEvents";
import * as appStore from "../AppStore";
import * as MyMonitor from "../MyMonitor";
import { Client, ClientConfig } from "./Client";

export type CanvasConfig = {

};

type State = {
    localClient: ClientConfig,
    remoteClients: Map<string, ClientConfig>,
    statsCollectingTimeInMs?: number;
}
export class Canvas extends React.Component<CanvasConfig, State> {
    private localClientMediaTrackAddedListener?: appEvents.MediaTrackAddedListener;
    private localClientMediaTrackRemovedListener?: appEvents.MediaTrackRemovedListener;
    private remoteClientTrackAddedListener?: appEvents.MediaTrackAddedListener;
    private remoteClientTrackRemovedListener?: appEvents.MediaTrackRemovedListener;
    private metricsUpdatedListener?: MyMonitor.MetricsListener;
    constructor (props: CanvasConfig){
        super(props);
    }

    componentDidMount() {
        this.setState({
            localClient: {
                id: appStore.getClientId(),
                userId: appStore.getUserId(),
                stream: new MediaStream(),
            },
            remoteClients: new Map<string, ClientConfig>(),
        });

        this.localClientMediaTrackAddedListener = (message) => {
            const { track } = message;
            const localClient = this.state.localClient;
            localClient.stream.addTrack(track);
            this.setState({ ...this.state, localClient });
        };
        appEvents.onLocalMediaTrackAdded(this.localClientMediaTrackAddedListener);
        
        this.localClientMediaTrackRemovedListener = (message) => {
            const { track } = message;
            const localClient = this.state.localClient;
            localClient.stream.removeTrack(track);
            this.setState({ ...this.state, localClient });
        }
        appEvents.onLocalMediaTrackRemoved(this.localClientMediaTrackRemovedListener);

        this.remoteClientTrackAddedListener = async message => {
            const remoteClients = this.state.remoteClients;
            const { track, userId, clientId: remoteClientId } = message;
            let remoteClient = remoteClients.get(remoteClientId);
            if (remoteClient) {
                remoteClient.stream.addTrack(track);
                return;
            }
            const stream = new MediaStream();
            remoteClient = {
                id: remoteClientId,
                userId,
                stream,
            };
            remoteClients.set(remoteClientId, remoteClient);
            this.setState({
                ...this.state,
                remoteClients,
            });
        };
        appEvents.onRemoteMediaTrackAdded(this.remoteClientTrackAddedListener);
        this.remoteClientTrackRemovedListener = (message) => {
            const { clientId: remoteClientId, track } = message;
            const remoteClients = this.state.remoteClients;
            const remoteClient = remoteClients.get(remoteClientId);
            if (!remoteClient) return;
            remoteClient.stream.removeTrack(track);
            if (0 < remoteClient.stream.getTracks().length) return;
            remoteClients.delete(remoteClientId);
            this.setState({
                ...this.state,
                remoteClients,
            });
        };
        appEvents.onRemoteMediaTrackRemoved(this.remoteClientTrackRemovedListener);

        this.metricsUpdatedListener = metrics => {
            const stats: string[] = [];
            this.state?.localClient?.stream.getTracks().forEach(track => {
                const trackStats = metrics.tracks.get(track.id);
                if (!trackStats) return;
                Array.from(trackStats.layers.values()).forEach(layer => {
                    Object.entries(layer).map(kv => `${kv[0]}: ${kv[1]}`).forEach(line => stats.push(line));
                });
                stats.push(``);
            })
            this.setState({
                ...this.state,
                statsCollectingTimeInMs: metrics.statsCollectedInMs,
            });
        };
        MyMonitor.onMetricsUpdated(this.metricsUpdatedListener);
    }

    componentWillUnmount() {
        if (this.localClientMediaTrackAddedListener) {
            appEvents.offLocalMediaTrackAdded(this.localClientMediaTrackAddedListener);
        }
        if (this.localClientMediaTrackRemovedListener) {
            appEvents.offLocalMediaTrackAdded(this.localClientMediaTrackRemovedListener);
        }
        if (this.remoteClientTrackAddedListener) {
            appEvents.offRemoteMediaTrackAdded(this.remoteClientTrackAddedListener);
        }
        if (this.remoteClientTrackRemovedListener) {
            appEvents.offRemoteMediaTrackRemoved(this.remoteClientTrackRemovedListener);
        }
        if (this.metricsUpdatedListener) {
            MyMonitor.offMetricsUpdated(this.metricsUpdatedListener);
        }
    }

    render() {
        return (
            <div>
                <div>
                {
                    (this.state?.localClient) ? (
                        <Client id={this.state.localClient.id} stream={this.state.localClient.stream} playBtn={true} userId={this.state.localClient.userId} muteBtn={true}/>
                    ) : <></>
                }
                </div>
                <section id="remoteClients">
                    {
                        (this.state?.remoteClients) 
                            ? Array.from(this.state.remoteClients.values()).map((remoteClient) => 
                            <div key={remoteClient.id}>
                                <Client stream={remoteClient.stream} id={remoteClient.id} userId={remoteClient.userId}/>
                            </div>
                            ) 
                            : <></>
                    }
                </section>
                {
                    (this.state?.statsCollectingTimeInMs) ? <h3>Last Stats collecting time in ms: <span>{this.state.statsCollectingTimeInMs}</span></h3> : <></>
                }
            </div>
        );
    }
}

