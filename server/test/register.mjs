/* server/test/register.mjs — rejestruje loader stubujący partyserver (patrz loader.mjs). */
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
