import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, User } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import MemoryStore from "memorystore";

declare global {
  namespace Express {
    interface User extends User {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  // Verifica se a senha armazenada está no formato esperado (hash.salt)
  if (!stored || !stored.includes('.')) {
    console.error('Formato de senha armazenada inválido');
    return false;
  }

  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Configurar memorystore para sessão
  const MemStore = MemoryStore(session);
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'redeG7_support_system_secret',
    resave: false,
    saveUninitialized: false,
    store: new MemStore({
      checkPeriod: 86400000 // limpar sessões expiradas a cada 24h
    }),
    cookie: {
      maxAge: 8 * 60 * 60 * 1000 // 8 horas
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Configurar estratégia local
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Buscar usuário pelo nome de usuário
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username));
        
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: 'Usuário ou senha inválidos' });
        }

        if (user.isBlocked) {
          return done(null, false, { message: 'Sua conta está bloqueada. Entre em contato com o administrador.' });
        }

        if (!user.isActive) {
          return done(null, false, { message: 'Sua conta está desativada. Entre em contato com o administrador.' });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  // Serialização e deserialização de usuário
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      // Buscar usuário pelo ID
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id));

      // Re-check block status on every request
      if (user && (user.isBlocked || !user.isActive)) {
        return done(null, undefined);
      }
      
      done(null, user || undefined);
    } catch (error) {
      done(error);
    }
  });

  // Rota de autenticação básica
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: info?.message || 'Usuário ou senha inválidos' 
        });
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  // Rota de logout
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ success: true, message: 'Logout efetuado com sucesso' });
    });
  });

  // Rota para obter o usuário atualmente autenticado
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ success: false, message: 'Não autenticado' });
    }
    
    // Não enviar o hash da senha para o cliente
    if (req.user) {
      const { password, ...userWithoutPassword } = req.user;
      res.json(userWithoutPassword);
    } else {
      res.status(500).json({ success: false, message: 'Erro interno de autenticação' });
    }
  });
}