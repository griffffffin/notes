import {waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {broadcastLogout, subscribeRemoteLogout} from "./sessionBroadcast";

/* LAPOK KÖZTI KIJELENTKEZÉS. A "másik lapot" egy második, azonos nevű BroadcastChannel
   játssza (Node/jsdom alatt az azonos nevű csatornák egy folyamaton belül üzennek, a saját
   üzenetét egy példány nem kapja meg). A modul csatornája a betöltéskor jött létre. */
describe("lapok közti kijelentkezés (sessionBroadcast)", () => {
    const CHANNEL_NAME = "notes-session";
    const peers: BroadcastChannel[] = [];
    const makePeer = (): BroadcastChannel => {
        const peer = new BroadcastChannel(CHANNEL_NAME);
        peers.push(peer);
        return peer;
    };
    const nextMessage = (peer: BroadcastChannel): Promise<unknown> =>
        new Promise((resolve) => { peer.onmessage = (event) => resolve(event.data); });
    const wait = (ms: number): Promise<void> =>
        new Promise((resolve) => { setTimeout(resolve, ms); });

    // A modul-szintű feliratkozók a tesztek közt is élnének; minden feliratkozást bontunk.
    const unsubscribes: (() => void)[] = [];
    const subscribe = (listener: () => void): void => { unsubscribes.push(subscribeRemoteLogout(listener)); };
    afterEach(() => {
        unsubscribes.splice(0).forEach((unsubscribe) => { unsubscribe(); });
        peers.forEach((peer) => peer.close());
        peers.length = 0;
    });

    it("broadcastLogout logout üzenetet küld a többi lapnak", async () => {
        const peer = makePeer();
        const message = nextMessage(peer);

        broadcastLogout();

        expect(await message).toEqual({type: "logout"});
    });

    it("egy másik lap logoutja értesíti a feliratkozót", async () => {
        const notified = vi.fn();
        subscribe(notified);

        makePeer().postMessage({type: "logout"});

        await waitFor(() => expect(notified).toHaveBeenCalledTimes(1));
    });

    it("leiratkozás után NEM értesít (kontroll)", async () => {
        const notified = vi.fn();
        const unsubscribe = subscribeRemoteLogout(notified);
        unsubscribe();

        makePeer().postMessage({type: "logout"});
        await wait(60);

        expect(notified).not.toHaveBeenCalled();
    });

    it("hibás alakú üzenetre NEM értesít", async () => {
        const notified = vi.fn();
        subscribe(notified);
        const peer = makePeer();

        peer.postMessage({type: "nonsense"});   // ismeretlen típus
        peer.postMessage("logout");             // nem objektum
        peer.postMessage(null);                 // null
        await wait(60);

        expect(notified).not.toHaveBeenCalled();
    });
});
