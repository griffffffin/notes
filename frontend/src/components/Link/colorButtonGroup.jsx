import LinkColorButton from "./colorButton";

export default function ColorButtonGroup(props) {
    return (
        <div className="pt-2 pb-2 pe-1">
            <LinkColorButton color="success" cookies={props.cookies} onClick={props.onClick}/>
            <LinkColorButton color="warning" cookies={props.cookies} onClick={props.onClick}/>
            <LinkColorButton color="danger" cookies={props.cookies} onClick={props.onClick}/>
            <LinkColorButton color="secondary" cookies={props.cookies} onClick={props.onClick}/>
            <LinkColorButton color="info" cookies={props.cookies} onClick={props.onClick}/>
            <LinkColorButton color="primary" cookies={props.cookies} onClick={props.onClick}/>
        </div>
    );
}
