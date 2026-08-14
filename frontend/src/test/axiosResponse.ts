import {AxiosHeaders} from "axios";
import type {AxiosResponse} from "axios";

/* A SZERVER VÁLASZA a `then` visszahívás alakjában.

   A tesztek eddig egy csonka `{data: …}` objektumot adtak át — olyat, ami a
   valódi láncban SOSEM fordul elő: az axios teljes választ ad (status,
   statusText, headers, config). Amíg a kód csak a `.data`-t olvasta, ez nem tűnt
   fel; az első `response.status`-ra hivatkozó sor viszont `undefined`-ot kapott
   volna, hibaüzenet nélkül. Egy pótlék akkor ér valamit, ha a valóság HELYETT
   áll be — nem akkor, ha csak addig hasonlít rá, ameddig épp ránézünk.

   Az `AxiosHeaders` az axios saját fejléc-osztálya (nem sima objektum): a típus
   is ezt kéri, és a valódi válaszban is ez áll.

   A `status` paraméter azért van, mert a hibaágakat vizsgáló tesztek nem 200-as
   választ adnak vissza; a `statusText` ilyenkor üres marad, mert a kódunk sehol
   nem olvassa, és egy kitalált szöveg csak úgy tenne, mintha jelentene valamit. */
export function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
    return {
        data,
        status,
        statusText: status === 200 ? "OK" : "",
        headers: new AxiosHeaders(),
        config: {headers: new AxiosHeaders()},
    };
}
