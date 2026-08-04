-- Let the buckets hold ciphertext
--
-- 0004 restricted jewelry-photos to image/* and documents to images and PDF.
-- That was written before the files were encrypted. What actually gets uploaded
-- now is an AES-GCM envelope: a version byte, an IV, and ciphertext. It is not
-- a JPEG and declaring it as one would be a lie the app had to keep telling.
--
-- So the encrypted buckets accept application/octet-stream, which is what these
-- bytes honestly are. The MIME allow-list stops being a content check and
-- becomes what it can actually enforce — a declared type — while the real
-- guarantee moves to the envelope: bytes that do not decrypt under the family
-- key are not shown, whatever they claim to be.
--
-- The browser still needs to know how to render a photo after decrypting it.
-- That is carried in the object's file extension (.webp / .jpg), which is
-- metadata about the plaintext, not a claim about the stored bytes.

update storage.buckets
set allowed_mime_types = array['application/octet-stream']
where id in ('jewelry-photos', 'documents');

-- Size caps stay as they were. Encryption adds 29 bytes — a version byte, a
-- 12-byte IV and a 16-byte tag — so a limit sized for the plaintext still fits.

-- Backups were already octet-stream-ish (json/gzip) and are written only by the
-- Worker, which encrypts them the same way. Widened for the same reason.
update storage.buckets
set allowed_mime_types = array['application/octet-stream']
where id = 'backups';
