import {useCallback} from "react";
import LinkLogo from "../Link/logo";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

export default function LogoAndCreate(props) {
    const handleCreateClick = useCallback(() => {
        props.handleLinkClicked();
        window.location = "/create";
    }, [props]);

    return (
        <div className="d-grid pb-1">
            <div className="input-group align-items-center">
                <LinkLogo onClick={props.isVisible && props.handleLinkClicked} color={props.color}/>
                {props.isCreateVisible &&
                    <FontAwesomeIcon role="button" className={"pt-1 ms-sm-3 ps-3 text-" + props.color}
                                     icon="fa-solid fa-plus" size="2x" onClick={handleCreateClick}/>
                }
            </div>
        </div>
    );
}
