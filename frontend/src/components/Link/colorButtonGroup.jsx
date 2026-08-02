import LinkColorButton from "./colorButton";
import {TODO_COLORS} from "../../todoColors";

/* A navbar szín-SZŰRŐJE: minden paletta-színre egy korong, ami a szín szerint
   szűrt listára visz (/to-dos/color/:name). A szerkesztő szín-VÁLASZTÓJA
   (Button/colorButtonGroup) ugyanebből a palettából épül — a színek listája
   egyetlen helyen él (todoColors.js), így egy új szín felvétele mindkét helyen
   magától megjelenik. (Eddig itt kézzel voltak felsorolva; a todoColors.js
   kommentje már állította, hogy "a kulcsok sorrendje egyben a színválasztó gombok
   sorrendje" — a kézi lista ezt bármikor meghazudtolhatta volna.)

   A sorrend FORDÍTOTT, és ez nem elírás: a korongok `float-end`-del úsznak
   (l. colorButton.jsx), tehát az ELSŐKÉNT kirakott elem kerül LEGJOBBRA. A
   megfordítással a vizuális sorrend balról jobbra pontosan a TODO_COLORS
   sorrendje lesz — ugyanaz, amit a szerkesztő színválasztója mutat. Ha valaki a
   float-end-et flexre cserélné, a megfordítást is el kell hagyni. */
export default function ColorButtonGroup(props) {
    return (
        <div className="pt-2 pb-2 pe-1">
            {Object.keys(TODO_COLORS).toReversed().map((color) =>
                <LinkColorButton key={color} color={color} onClick={props.onClick}/>
            )}
        </div>
    );
}
