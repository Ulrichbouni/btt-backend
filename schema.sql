-- Schéma complet de la base de données BTT-LUX

-- Utilisateurs
CREATE TABLE IF NOT EXISTS utilisateurs (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telephone VARCHAR(20),
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('client', 'technicien', 'admin')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Secrets OTP pour 2FA
CREATE TABLE IF NOT EXISTS otp_secrets (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,
    secret VARCHAR(255) NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(utilisateur_id)
);

-- Catalogue produits
CREATE TABLE IF NOT EXISTS produits (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(200) NOT NULL,
    nom_en VARCHAR(200),
    epaisseur VARCHAR(20) NOT NULL,
    categorie VARCHAR(100) NOT NULL,
    application TEXT,
    application_en TEXT,
    prix_ttc DECIMAL(10,2) NOT NULL,
    poids_unite DECIMAL(6,2) NOT NULL,
    qte_conteneur INTEGER NOT NULL,
    statut_stock VARCHAR(50) DEFAULT 'disponible',
    image_url TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Devis
CREATE TABLE IF NOT EXISTS devis (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES utilisateurs(id),
    surface DECIMAL(8,2),
    ville VARCHAR(100) NOT NULL,
    adresse TEXT NOT NULL,
    date_souhaitee DATE,
    statut VARCHAR(50) DEFAULT 'envoye' CHECK (statut IN ('envoye', 'en_cours', 'accepte', 'refuse', 'paye')),
    cout_estime_brut DECIMAL(12,2),
    remise_pourcentage DECIMAL(5,2) DEFAULT 0,
    frais_transport DECIMAL(10,2) DEFAULT 0,
    frais_divers DECIMAL(10,2) DEFAULT 0,
    total_final DECIMAL(12,2),
    photos TEXT[],
    plans TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Chantiers
CREATE TABLE IF NOT EXISTS chantiers (
    id SERIAL PRIMARY KEY,
    devis_id INTEGER REFERENCES devis(id) UNIQUE,
    mission_id INTEGER REFERENCES missions_technicien(id),
    etape_actuelle VARCHAR(100) DEFAULT 'demarrage',
    historique JSONB DEFAULT '[]'::jsonb,
    adresse TEXT NOT NULL,
    ville VARCHAR(100) NOT NULL,
    date_debut DATE,
    date_fin_prevue DATE,
    date_fin_reelle DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Missions technicien
CREATE TABLE IF NOT EXISTS missions_technicien (
    id SERIAL PRIMARY KEY,
    devis_id INTEGER REFERENCES devis(id),
    technicien_id INTEGER REFERENCES utilisateurs(id),
    date_visite TIMESTAMP NOT NULL,
    statut VARCHAR(50) DEFAULT 'planifiee' CHECK (statut IN ('planifiee', 'en_cours', 'terminee', 'annulee')),
    rapport_visite TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Mesures terrain
CREATE TABLE IF NOT EXISTS mesures_terrain (
    id SERIAL PRIMARY KEY,
    mission_id INTEGER REFERENCES missions_technicien(id),
    longueur_murs DECIMAL(6,2) NOT NULL,
    hauteur_sous_plafond DECIMAL(6,2) NOT NULL,
    surface_ouverte DECIMAL(6,2) DEFAULT 0,
    perimetre DECIMAL(6,2),
    surface_reelle DECIMAL(8,2),
    nb_panneaux_reel INTEGER,
    photo_urls TEXT[] DEFAULT '{}',
    croquis_url TEXT,
    valide_par_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Paiements
CREATE TABLE IF NOT EXISTS paiements (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES utilisateurs(id),
    devis_id INTEGER REFERENCES devis(id),
    methode VARCHAR(50) NOT NULL CHECK (methode IN ('orange_money', 'mtn', 'stripe', 'carte', 'virement')),
    montant DECIMAL(12,2) NOT NULL,
    reference VARCHAR(100) UNIQUE NOT NULL,
    transaction_id VARCHAR(100),
    statut VARCHAR(50) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'reussi', 'echoue', 'rembourse')),
    notchpay_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Historique calculs
CREATE TABLE IF NOT EXISTS calculs_historique (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES utilisateurs(id),
    surface DECIMAL(8,2) NOT NULL,
    type_batiment VARCHAR(50) NOT NULL,
    etage INTEGER DEFAULT 0,
    epaisseur_panneau VARCHAR(20),
    nb_panneaux INTEGER NOT NULL,
    cout_total DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Professionnels BTP
CREATE TABLE IF NOT EXISTS professionnels (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    role VARCHAR(100) NOT NULL,
    ville VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    niveau_certification VARCHAR(100),
    note DECIMAL(2,1) CHECK (note >= 0 AND note <= 5),
    nb_chantiers INTEGER DEFAULT 0,
    disponible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES utilisateurs(id),
    titre VARCHAR(255) NOT NULL,
    corps TEXT NOT NULL,
    lu BOOLEAN DEFAULT FALSE,
    type VARCHAR(50) DEFAULT 'info',
    date_envoi TIMESTAMP DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX IF NOT EXISTS idx_devis_utilisateur ON devis(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_missions_technicien ON missions_technicien(technicien_id);
CREATE INDEX IF NOT EXISTS idx_paiements_reference ON paiements(reference);
CREATE INDEX IF NOT EXISTS idx_notifications_utilisateur ON notifications(utilisateur_id);

-- Insertion d'un admin par défaut (mot de passe: admin123)
INSERT INTO utilisateurs (nom, email, telephone, mot_de_passe_hash, role)
SELECT 'Admin BTT-LUX', 'admin@btt-lux.com', '+237670000000', 
    '$2b$10$rOjXgKkqZ8Y5xH7vN9pQOe1aBcDfGhIjKlMnOpQrStUvWxYz123456789', 
    'admin'
WHERE NOT EXISTS (SELECT 1 FROM utilisateurs WHERE email = 'admin@btt-lux.com');

-- Insertion de produits exemple
INSERT INTO produits (nom, nom_en, epaisseur, categorie, application, prix_ttc, poids_unite, qte_conteneur, statut_stock) VALUES
('Luxerboard Standard', 'Luxerboard Standard', '10mm', 'Plafonds', 'Plafonds résidentiels et commerciaux', 8500, 8.5, 200, 'En stock'),
('Luxerboard Premium', 'Luxerboard Premium', '12mm', 'Façades', 'Façades et bardages', 12500, 10.2, 150, 'En stock'),
('Luxerboard Industriel', 'Luxerboard Industriel', '14mm', 'Industriel', 'Isolation industrielle', 15800, 12.0, 120, 'En stock'),
('Luxerboard Acoustique', 'Luxerboard Acoustique', '10mm', 'Cloisons', 'Cloisons phoniques', 9800, 9.0, 180, 'En stock'),
('Accessoires de fixation', 'Fixation Accessories', '-', 'Accessoires', 'Vis, rondelles, supports', 500, 0.1, 1000, 'En stock')
ON CONFLICT DO NOTHING;
