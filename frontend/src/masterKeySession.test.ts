import {act, renderHook, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {clearMasterKey, enroll, getMasterKey, hasMasterKey, requestMasterKeyFromPeers,
    unlock, useMasterKeyStatus, usePeerUnlockAttempt} from "./masterKeySession";
import {bytesToBase64} from "./e2ee/base64";

/* A MESTERKULCS-SESSION tesztjei. A lényeg a kulcs-hierarchia kör-bezárása: a
   regisztráció feloldva indul, a HELYES jelszó UGYANAZT a mesterkulcsot oldja fel, a
   ROSSZ jelszó pedig DOB (ez a jelszó-ellenőrzés a kliensen). A modul-szintű kulcsot
   tesztenként nullázzuk. */

// MINIMÁLIS KDF a gyorsaságért — a biztonsági tulajdonságokat (kör, rossz jelszó) a
// paraméter nem befolyásolja, csak a futásidőt. Éles hívó a DEFAULT_KDF-et használja.
const TEST_KDF = {memorySize: 256, iterations: 1, parallelism: 1};

beforeEach(() => { clearMasterKey(); });

describe("regisztráció (enroll)", () => {
    it("feloldva indul, és a beiratkozást adja vissza", async () => {
        const enrollment = await enroll("jelszó", TEST_KDF);

        expect(hasMasterKey()).toBe(true);
        expect(getMasterKey()).toHaveLength(32);
        expect(typeof enrollment.wrappedMk).toBe("string");
        expect(typeof enrollment.kdfSalt).toBe("string");
        expect(enrollment.kdf).toEqual({algorithm: "argon2id", ...TEST_KDF});
    });
});

describe("feloldás (unlock)", () => {
    it("a HELYES jelszó UGYANAZT a mesterkulcsot oldja fel (a kör bezárul)", async () => {
        const enrollment = await enroll("helyes jelszó", TEST_KDF);
        const afterEnroll = [...getMasterKey()];

        clearMasterKey();
        expect(hasMasterKey()).toBe(false);

        await unlock("helyes jelszó", enrollment);

        expect([...getMasterKey()]).toEqual(afterEnroll);
    });

    it("ROSSZ jelszóval DOB, és zárolt marad", async () => {
        const enrollment = await enroll("helyes jelszó", TEST_KDF);
        clearMasterKey();

        await expect(unlock("rossz jelszó", enrollment)).rejects.toThrow();
        expect(hasMasterKey()).toBe(false);
    });
});

describe("a zárolt állapot", () => {
    it("kulcs nélkül getMasterKey DOB — nyílt szöveggel sosem esünk vissza", () => {
        expect(hasMasterKey()).toBe(false);
        expect(() => getMasterKey()).toThrow(/zárolva/);
    });

    it("a kulcs eldobása zárol", async () => {
        await enroll("jelszó", TEST_KDF);
        expect(hasMasterKey()).toBe(true);

        clearMasterKey();

        expect(hasMasterKey()).toBe(false);
        expect(() => getMasterKey()).toThrow();
    });
});

/* A KAPU-HOOK: a felület ebből tudja, zárolt-e — és a kulcs megérkezésekor/eldobásakor
   ÚJRA KELL rajzolnia (a lock-képernyő ezen múlik). Ez a reaktív store (emit/subscribe)
   viselkedésének próbája is. */
describe("useMasterKeyStatus", () => {
    it("követi a zárolt→feloldott→zárolt átmenetet", async () => {
        const {result} = renderHook(() => useMasterKeyStatus());
        expect(result.current).toBe(false);

        await act(async () => { await enroll("jelszó", TEST_KDF); });
        expect(result.current).toBe(true);

        act(() => { clearMasterKey(); });
        expect(result.current).toBe(false);
    });
});

/* LAPOK KÖZTI KULCS-MEGOSZTÁS (BroadcastChannel). A "másik lapot" egy második, azonos
   nevű csatorna játssza: Node-ban (és a jsdom-teszt alatt) az azonos nevű csatornák egy
   folyamaton belül üzennek egymásnak, és egy példány a SAJÁT üzenetét nem kapja meg. A
   modul csatornája a betöltéskor jött létre; a "peer" itt a teszté. */
describe("lapok közti kulcs-megosztás", () => {
    const CHANNEL_NAME = "e2ee-master-key";
    const peers: BroadcastChannel[] = [];
    const makePeer = (): BroadcastChannel => {
        const peer = new BroadcastChannel(CHANNEL_NAME);
        peers.push(peer);
        return peer;
    };
    // A csatorna következő üzenete Promise-ként — a peer a SAJÁT üzenetét nem kapja vissza.
    const nextMessage = (peer: BroadcastChannel): Promise<unknown> =>
        new Promise((resolve) => { peer.onmessage = (event) => resolve(event.data); });
    const wait = (ms: number): Promise<void> =>
        new Promise((resolve) => { setTimeout(resolve, ms); });

    afterEach(() => {
        peers.forEach((peer) => peer.close());
        peers.length = 0;
        clearMasterKey();
    });

    const MK = new Uint8Array(32).fill(7);

    it("egy másik lap provide-ja feloldja a zárolt lapot", async () => {
        expect(hasMasterKey()).toBe(false);
        makePeer().postMessage({type: "provide", mk: bytesToBase64(MK)});

        await waitFor(() => expect(hasMasterKey()).toBe(true));
        expect([...getMasterKey()]).toEqual([...MK]);
    });

    it("feloldott lapként a request-re átadja a kulcsot", async () => {
        const peer = makePeer();
        // A kulcsot NEM enroll-lal állítjuk be (az külön announce-t szórna), hanem provide-dal.
        peer.postMessage({type: "provide", mk: bytesToBase64(MK)});
        await waitFor(() => expect(hasMasterKey()).toBe(true));

        const reply = nextMessage(peer);
        peer.postMessage({type: "request"});

        expect(await reply).toEqual({type: "provide", mk: bytesToBase64(MK)});
    });

    it("zárolt lapként a request-re HALLGAT (nem küld üres/hamis választ)", async () => {
        expect(hasMasterKey()).toBe(false);
        const peer = makePeer();
        let replied = false;
        peer.onmessage = () => { replied = true; };

        peer.postMessage({type: "request"});
        await wait(60);

        expect(replied).toBe(false);
    });

    it("a provide NEM írja felül a már feloldott kulcsot", async () => {
        const peer = makePeer();
        peer.postMessage({type: "provide", mk: bytesToBase64(MK)});
        await waitFor(() => expect(hasMasterKey()).toBe(true));

        peer.postMessage({type: "provide", mk: bytesToBase64(new Uint8Array(32).fill(9))});
        await wait(60);

        expect([...getMasterKey()]).toEqual([...MK]);
    });

    it("feloldáskor (unlock) felajánlja a kulcsot a többi lapnak", async () => {
        const enrollment = await enroll("jelszó", {memorySize: 256, iterations: 1, parallelism: 1});
        clearMasterKey();
        const peer = makePeer();
        const announced = nextMessage(peer);

        await unlock("jelszó", enrollment);

        expect(await announced).toMatchObject({type: "provide"});
    });

    it("hibás alakú üzenetet figyelmen kívül hagy (nem old fel garázs kulccsal)", async () => {
        // A séma-ellenőrzés nélkül a base64ToBytes(42) is DEKÓDOLNA (atob("42")) → egy
        // rossz típusú mk hibás kulcsot állítana be. A parseChannelMessage ezt kizárja.
        expect(hasMasterKey()).toBe(false);
        const peer = makePeer();
        peer.postMessage({type: "provide", mk: 42});   // rossz típusú mk
        peer.postMessage({type: "provide"});           // hiányzó mk
        peer.postMessage({nonsense: true});            // ismeretlen alak
        await wait(60);

        expect(hasMasterKey()).toBe(false);
    });

    it("requestMasterKeyFromPeers request üzenetet küld", async () => {
        const peer = makePeer();
        const request = nextMessage(peer);

        requestMasterKeyFromPeers();

        expect(await request).toEqual({type: "request"});
    });
});

/* A LOCK-KÉPERNYŐ ELŐTTI PEER-KÍSÉRLET hookja. Zárolt lapon kérdez és VÁR (a hívó karikát
   mutat), a határidő után feladja; nem-zárolt lapon nem csinál semmit. */
describe("usePeerUnlockAttempt", () => {
    const peers: BroadcastChannel[] = [];
    const makePeer = (): BroadcastChannel => {
        const peer = new BroadcastChannel("e2ee-master-key");
        peers.push(peer);
        return peer;
    };
    afterEach(() => { peers.forEach((peer) => peer.close()); peers.length = 0; clearMasterKey(); });

    it("zárolt lapon kérdez, karikát jelez, majd a határidő után feladja", async () => {
        const peer = makePeer();
        const request = new Promise((resolve) => { peer.onmessage = (event) => resolve(event.data); });

        const {result} = renderHook(() => usePeerUnlockAttempt(true));

        expect(result.current).toBe(true);
        expect(await request).toEqual({type: "request"});
        await waitFor(() => expect(result.current).toBe(false));
    });

    it("nem-zárolt lapon nem kérdez és nem vár (kontroll)", async () => {
        const peer = makePeer();
        let asked = false;
        peer.onmessage = () => { asked = true; };

        const {result} = renderHook(() => usePeerUnlockAttempt(false));

        expect(result.current).toBe(false);
        await new Promise((resolve) => { setTimeout(resolve, 60); });
        expect(asked).toBe(false);
    });
});
