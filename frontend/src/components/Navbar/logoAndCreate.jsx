import {Link} from "react-router-dom";
import LinkLogo from "../Link/logo";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTheme} from "../../contexts/theme";

export default function LogoAndCreate(props) {
    const {color} = useTheme();

    return (
        <div className="d-grid pb-1">
            <div className="input-group align-items-center">
                <LinkLogo onClick={props.isVisible && props.handleLinkClicked}/>
                {props.isCreateVisible &&
                    /* Link, és nem kattintás-kezelős ikon: a "+" egy OLDALRA visz
                       (/create), nem műveletet végez — ahogy mellette a logó is
                       linkként visz a főoldalra. Így jár az állapotsori cím, a
                       középső gombos "új lapon megnyitás" és a jobb gombos menü,
                       a képernyőolvasó pedig linkként hirdeti ki. A kézzel adott
                       role="button" épp ezért marad el: azt a linkség ingyen
                       hozza, ráadásul gombnak hazudná a célpontot.

                       A kódban maradó navigate() hívások (mentés, törlés, belépés
                       után a főoldalra) jogosan kéziek: azok egy MŰVELET
                       eredményei, nem célpontok — linkként hamis ígéret lenne
                       rájuk kattintani. */
                    <Link to="/to-do/create" onClick={props.handleLinkClicked} className="no-focus">
                        <FontAwesomeIcon className={"pt-1 ms-sm-3 ps-3 text-" + color}
                                         icon="fa-solid fa-plus" size="2x"/>
                    </Link>
                }
            </div>
        </div>
    );
}
