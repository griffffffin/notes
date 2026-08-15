import FilterLink, {type FilterLinkProps} from "./filterLink";
import type {Quote} from "../../types/api";
import {PATHS} from "../../paths";

/* Egy szerző-hivatkozás az idézet-kártya láblécén — a to-do LinkCategory párja: a
   szerző szűrt nézetére visz (/quotes/:author). A link VÁZÁT (kódolás, szín,
   megjelenés) a közös FilterLink adja; itt csak az idézet-specifikus rész marad.

   ELTÉRÉS a kategória-párjától: NÉVTELEN idézetnek nincs lábléce. Az "Anonymous"
   jelölő CSAK az URL-ben létezik (a /quotes/Anonymous szűrő szegmenseként), a
   felületen sehol nem írjuk ki — így a kártya olyan, mint a publikus nézet:
   szerző csak akkor látszik, ha van. A to-do kategóriája ezzel szemben kötelező,
   ott nincs mit elrejteni.

   Az `Omit` a váz propjaiból veszi ki azt a kettőt, amit ez a komponens maga tölt
   ki (`buildPath`, `value`) — a maradékot (onClick, color, class) változatlanul
   kapja és adja tovább. A szerző típusa a szerződésből jön: a `Quote["author"]`
   opcionális, ezért kell a fenti korai kilépés. */
type LinkAuthorProps = Omit<FilterLinkProps, "buildPath" | "value"> & {
    author: Quote["author"];
};

export default function LinkAuthor(props: LinkAuthorProps) {
    if (!props.author) return null;

    return <FilterLink buildPath={PATHS.quotesByAuthor} value={props.author} onClick={props.onClick}
                       color={props.color} class={props.class}/>;
}
