
/* „NEM SIKERÜLT BETÖLTENI" — egy helyen, mert több nézetnek kell.

   MIÉRT VAN EGYÁLTALÁN. Egy sikertelen betöltés eddig kétféleképp látszott, és
   egyik sem volt igaz: a listáknál ÜRES nézetnek (mintha nem lenne adatod), a
   szerkesztőben pedig ÖRÖKKÉ PÖRGŐ karikának (ami azt ígéri, mindjárt jön). A
   felhasználó egyikből sem tudta megkülönböztetni a hibát a valóságtól — ez a
   projekt visszatérő hibaosztálya: nem hibázik semmi, csak az eredmény hazudik.

   MIÉRT ÍGY NÉZ KI. Az első változat egy sima szövegsor volt, a második egy
   Bootstrap-alert sáv a lap tetején — egyik sem az app hangján beszélt. Ez a
   harmadik az app SAJÁT nyelvét használja: ugyanaz a kártya, amiben a szerkesztő
   és a megosztott idézet is ül (átlátszó háttér, kétpixeles keret), és ugyanaz a
   Caveat betű, amivel az idézetek megjelennek — csak a keret és a szöveg piros.
   Így a hibajelzés nem idegen test a felületen, hanem annak egy állapota.

   AZ „ÚJRA" GOMB a lényegi különbség az eddigiekhez képest: a felhasználónak nem
   csak közlünk valamit, hanem adunk is neki tennivalót. És nem oldalfrissítést —
   az az egész alkalmazást újratöltené, elveszítve minden állapotot — hanem
   PONTOSAN AZT a lekérést ismétli meg, ami elbukott. A hiba oka jellemzően múló
   (hálózati zökkenő, épp újrainduló szerver), tehát a második próbálkozás
   valóban sikerülhet.

   MIT NEM ÍR KI. Se végpontot, se hibakódot, se séma-üzenetet. Az a szerver
   naplójába való (contractFault.ts → /client-error); a felhasználónak az a
   hasznos, hogy nem ő rontott el semmit, és mit tehet. */

type LoadFailedNoticeProps = {
    /* Mi nem érhető el — teljes mondat, mert nézetenként más ("A lista most nem
       érhető el.", "A szerkesztő most nem tölthető be."). */
    message: string;
    /* A bukott lekérés újraindítása. Kötelező: egy jelzés, amiből nincs kiút,
       fél megoldás — ha egy nézet nem tud újrapróbálni, az a nézet hibája. */
    onRetry: () => void;
};

export default function LoadFailedNotice({message, onRetry}: LoadFailedNoticeProps) {
    return (
        /* A KÁRTYA PIROS, A LAP NEM. Volt egy változat, ami az EGÉSZ lapot
           pirosra váltotta (a navbart is): sötét témán még elment, világoson
           viszont riasztásnak hatott, és a navigáció is „hibás" színt kapott,
           pedig azzal semmi baj. A hiba ott jelezzen, AHOL VAN — a tartalom
           helyén —, a lap többi része maradjon a megszokott színén.

           A méretek a szerkesztő kártyájáéval egyeznek (col-11 … col-xl-6), hogy
           a jelzés ugyanott és ugyanakkora legyen, mint a tartalom, aminek a
           helyén áll. */
        <div className="col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card mx-auto mt-3
                        bg-transparent border-2 border-danger">
            <div className="card-body text-center text-danger" role="alert">
                <div className="pb-3 caveat">{message}</div>
                {/* A FELIRAT ÉS A GOMB A MEGOLDÁS SZÍNÉBEN: a kártya a hibáról
                    szól, a gomb viszont a kiút belőle — ezért a téma (illetve a
                    szekció) akcentusát viseli (.btn-outline-accent-base, l.
                    index.css). A piros dobozban az egyetlen nem piros elem
                    pontosan az, amit meg kell nyomni.

                    Ez a gomb NEM a közös SubmitButton: az a színt Bootstrap-
                    NÉVBŐL rakja össze (`btn-outline-` + szín), a mi akcentusunk
                    viszont nem szín-név, hanem CSS-változó. A `type="button"` itt
                    is kötelező (alapból "submit" lenne).

                    A FELIRAT szándékosan „lekérése", nem „küldése": ADAT jön BE a
                    szerverről. A „küldés" (resubmission) mást jelentene — a
                    felhasználó adatainak ismételt elküldését —, ami itt nem
                    történik. És nem „Frissítés": az oldal NEM töltődik újra, csak
                    az az egy lekérés fut le megint. */}
                <div className="d-grid col-10 col-sm-8 mx-auto">
                    <button type="button" onClick={onRetry}
                            className="btn rounded-pill w-100 btn-outline-accent-base">
                        Adatok ismételt lekérése
                    </button>
                </div>
            </div>
        </div>
    );
}
