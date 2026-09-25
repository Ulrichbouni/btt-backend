// Environnement de test, chargé avant tout module applicatif (setupFiles).
//
// NODE_ENV=test est indispensable : services/email.js s'en sert pour
// simuler les envois. Sans cela, les tests d'intégration déclenchent de vrais
// emails (ex. email de bienvenue à /register) vers des adresses factices,
// ce qui consomme le quota SMTP et produit des rebonds.
process.env.NODE_ENV = 'test';

// Store OTP en mémoire : les tests restent indépendants de la base de
// données et ne purgent pas les codes des autres environnements.
process.env.OTP_STORE = 'memory';
