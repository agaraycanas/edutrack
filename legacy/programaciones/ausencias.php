<?php

include("util.php");
//------------------------------------------------
// Comienzo del programa "ausencias.php"
//------------------------------------------------
$nif = $_REQUEST['nif'];

echo '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xml:lang="es" xmlns="http://www.w3.org/1999/xhtml">
	<head>
		<meta http-equiv="Content-type" content="text/html; charset=utf-8" />
		<link rel="stylesheet" href="css/estilos.css" media="all" />
		<title>.:: Registro de ausencias de ' . $nif . '::.</title>';
?>
<script language="JavaScript" src="calendario/javascripts.js">
</script>

<?php

//---------------------------------------------
//---------------------------------------------
//---------------------------------------------
echo '</head>
	<body>
	<h1>Registro de ausencias de ' . $nif . '</h1>';

echo '<form name="fFaltas" action="guardarAusencias.php" method="get">
    ';
echo '<input type="submit" value="Guardar cambios">
    ';
echo '<input type="button" id="Volver" value="Volver a programaciones" onclick="cerrar()" />
    ';
echo '<input type="hidden" name="nif" value="' . $nif . '"/>
    ';
//---------------------------------------------
// REGISTRO de NUEVA AUSENCIA
//---------------------------------------------
echo '<h3>NUEVA ASUSENCIA</h3>';
echo 'Fecha:  <input type="text" name="falta0" 
     onclick="muestraCalendario(\'\',\'fFaltas\',\'falta0\')" onfocus="blur()"/>
     ';
echo 'Causa:  <input type="text" name="causa0"/>
     ';
echo '<h3>AUSENCIAS ANTERIORES</h3>';

///---------------------------------------------
// LISTADO de AUSENCIAS ANTERIORES
//---------------------------------------------
$fFaltas = 'dat/faltas-'.$nif.'.xml';
$faltas = new SimpleXMLElement($fFaltas, null, true);

echo '<table>
    ';
echo '<tr>
        <th>Fecha</th>
        <th>Causa</th>
        <th>Eliminar</th>
    </tr>
    ';

$nFalta = 0;
$i = 1;
foreach ($faltas as $falta) {
    echo "<tr>
        ";

    //**********************************************
    //FECHA de la FALTA
    //**********************************************

    $fechaAImprimir = date("j-n-Y", strtotime($falta));
    echo '<td><input type="text" name="falta' . $i . '" value="' . $fechaAImprimir . '"
         onclick="muestraCalendario(\'\',\'fFaltas\',\'falta' . $i
    . '\')" onfocus="blur()"/>';

    //**********************************************
    //CAUSA de la FALTA
    //**********************************************
    echo '<td><input type=text name="causa' . $i . '" value="' .
    $falta['causa'] . '"></td>
        ';

    //**********************************************
    //BOTÓN de BORRADO de la FALTA
    //**********************************************
    echo '<td><input type="button" class="imgLimpiar" onclick="
        limpiar(document.fFaltas.falta' . $i . ');
        limpiar(document.fFaltas.causa' . $i . ');"/>';
    echo '</td>
        ';
    //**********************************************
    //**********************************************

    echo "</tr>
    ";

    $i++;
}
echo '</table>
    ';
echo '<input type="submit" value="Guardar cambios"/>
    ';
echo '<input type="button" id="Volver" value="Volver a programaciones" onclick="cerrar()" />
    ';
echo '</form>
    </body>
    </html>
    ';
?>