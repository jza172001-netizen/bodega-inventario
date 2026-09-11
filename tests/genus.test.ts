/**
 * La regla de parecido entre nombres — la ÚNICA que hay, y no puede haber otra.
 *
 * Es la pieza más delicada de la app porque se equivoca de dos maneras opuestas
 * y las dos cuestan: si junta de menos, el bodeguero crea "Extensiones" al lado
 * de "Extension" y parte el inventario en dos. Si junta de más, esconde una
 * broca dentro de las brochas y no la vuelve a encontrar nunca.
 *
 * Los casos de acá salen de bugs reales documentados en el propio código.
 */
import { familiaDe, raizDeFamilia, looseMatch, sameGenus, getGenus, normStr } from '../utils/genus';
import { igual, esCierto, grupo, cerrar } from './correr';

grupo('familiaDe — la primera palabra', () => {
    igual(familiaDe('Lechada gris claro'), 'Lechada', 'como se habla en la bodega');
    igual(familiaDe('Lechada veige'), 'Lechada', 'aunque esté mal escrito el color');
    igual(familiaDe('Guantes (Negro · Nn)'), 'Guantes', 'sin el paréntesis de color y marca');
    igual(familiaDe('Gafas de seguridad'), 'Gafas', 'para poder abrir Gafas y verlas todas');
    // Si la primera palabra es muy corta para identificar algo, se toman dos.
    igual(familiaDe('G plac polvo'), 'G plac', 'inicial suelta: no alcanza con una');
});

grupo('raizDeFamilia — singular y plural caen juntos', () => {
    // "Extension (Blanca)" y "Extensiones (Negro)" son el mismo cable escrito
    // dos días distintos; el árbol las mostraba como dos familias.
    igual(raizDeFamilia('extensiones'), raizDeFamilia('extension'), 'extensiones = extension');
    igual(raizDeFamilia('guantes'), raizDeFamilia('guante'), 'guantes = guante');
    igual(raizDeFamilia('clavos'), raizDeFamilia('clavo'), 'clavos = clavo');
    igual(raizDeFamilia('palas'), raizDeFamilia('pala'), 'palas = pala');
});

grupo('lo que NUNCA se debe juntar', () => {
    // Esconder una broca dentro de las brochas es peor que tener dos familias:
    // el bodeguero no la vuelve a encontrar.
    esCierto(raizDeFamilia('broca') !== raizDeFamilia('brocha'), 'broca ≠ brocha');
    igual(sameGenus('Pala', 'Palustre'), false, 'pala ≠ palustre');
    igual(sameGenus('Martillo', 'Tornillo'), false, 'martillo ≠ tornillo');
});

grupo('looseMatch — el error de tecleo sí se perdona', () => {
    // "Peludora" por "Pulidora" son DOS letras cambiadas y es un error real que
    // Juli tuvo; una regla de un solo error no lo pillaba.
    esCierto(looseMatch('Pulidora grande', 'peludora'), 'Peludora encuentra Pulidora');
    esCierto(looseMatch('Martillo', 'amrtillo'), 'letras trocadas');
    esCierto(looseMatch('Hector Quiceno', 'hekto'), 'sirve mientras se teclea');
    igual(looseMatch('Martillo', 'ab'), false, 'con dos letras todo se parece a todo');
});

grupo('normStr y getGenus', () => {
    igual(normStr('Almádana'), 'almadana', 'quita tildes y baja a minúscula');
    igual(normStr('  Duván  '), 'duvan', 'y los espacios de sobra');
    igual(getGenus('Guantes (Negro · Nn)'), 'Guantes', 'quita el paréntesis del final');
    igual(getGenus('Pulidora grande'), 'Pulidora grande', 'sin paréntesis no toca nada');
});

cerrar();
