<?php
$nif = $_REQUEST['nif'];
//$nif = 'kk';
$fFaltas = 'dat/faltas-' . $nif . '.xml';
$f = Fopen($fFaltas, 'w+');
$contenidoXML = '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE faltas SYSTEM "faltas.dtd">
<faltas>
';
$datosURI[0] = 0;

$i = 0;
foreach ($_REQUEST as $key => $value) {
    $datosURI[$i++] = $value;
}
//Anyadimos faltas anteriores
for ($i = 3; $i < sizeof($datosURI); $i+=2) {
    if ($datosURI[$i] != '') {
        $contenidoXML.='<falta causa="' . $datosURI[$i + 1] . '">' .
                date('Y-n-j', strtotime($datosURI[$i])) . '</falta> 
                    ';
    }
}

//Anyadimos la nueva falta al final
if ($datosURI[1] != '') {
    $contenidoXML.='<falta causa="' . $datosURI[2] . '">' . $datosURI[1] . '</falta>
        ';
}

//Cerramos el 'root' del XML
$contenidoXML.='</faltas>';

//Grabamos el fichero
fwrite($f, $contenidoXML);
fclose($f);
?>
<html>
    <head>

    </head>
    <body onload="window.location(index.php)">
        <h1>Archivo guardado</h1>
    </body>
</html>
