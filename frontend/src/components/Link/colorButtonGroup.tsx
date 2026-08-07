import type {MouseEventHandler} from "react";
import LinkColorButton from "./colorButton";
import {TODO_COLOR_NAMES} from "../../todoColors";

/* A navbar szín-SZŰRŐJE: minden paletta-színre egy korong, ami a szín szerint
   szűrt listára visz (/to-dos/color/:name). A szerkesztő szín-VÁLASZTÓJA
   (Button/colorButtonGroup) ugyanebből a palettából épül — a színek listája
   egyetlen helyen él (todoColors.ts), így egy új szín felvétele mindkét helyen
   magától megjelenik. (Eddig itt kézzel voltak felsorolva; a todoColors.ts
   kommentje már állította, hogy "a kulcsok sorrendje egyben a színválasztó gombok
   sorrendje" — a kézi lista ezt bármikor meghazudtolhatta volna.)

   A sorrend FORDÍTOTT, és ez nem elírás: a korongok `float-end`-del úsznak
   (l. colorButton.tsx), tehát az ELSŐKÉNT kirakott elem kerül LEGJOBBRA. A
   megfordítással a vizuális sorrend balról jobbra pontosan a TODO_COLORS
   sorrendje lesz — ugyanaz, amit a szerkesztő színválasztója mutat. Ha valaki a
   float-end-et flexre cserélné, a megfordítást is el kell hagyni. */
type LinkColorButtonGroupProps = {
    onClick: MouseEventHandler<HTMLButtonElement>;
};

export default function ColorButtonGroup(props: LinkColorButtonGroupProps) {
    return (
        <div className="pt-2 pb-2 pe-1">
            {TODO_COLOR_NAMES.toReversed().map((color) =>
                <LinkColorButton key={color} color={color} onClick={props.onClick}/>
            )}
        </div>
    );
}
